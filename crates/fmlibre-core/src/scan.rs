use std::collections::{BTreeMap, HashMap, HashSet};

use fmlibre_mem::{Module, Process, Region, is_user_pointer, regions};
use serde::Serialize;

/// Tuning for [`scan_object_arrays`].
#[derive(Debug, Clone)]
pub struct ScanOptions {
    /// Ignore arrays with fewer elements than this.
    pub min_count: u64,
    /// Ignore arrays with more elements than this.
    pub max_count: u64,
    /// Elements sampled to decide whether an array holds game objects.
    pub samples: u64,
    /// Upper bound on elements inspected per array for the vtable census.
    pub census_limit: u64,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self { min_count: 500, max_count: 2_000_000, samples: 32, census_limit: 500_000 }
    }
}

/// A `(begin, end)` pointer pair stored in the module that brackets a heap array of
/// pointers to polymorphic objects. FM keeps its people, clubs and other entity
/// tables in arrays of this shape.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrayCandidate {
    /// RVAs of every place in the module where this pair is stored.
    pub pair_rvas: Vec<u64>,
    pub begin: u64,
    pub end: u64,
    pub count: u64,
    /// Elements inspected for the vtable census.
    pub inspected: u64,
    /// Most common vtables among the inspected elements, most frequent first.
    pub vtables: Vec<VtableCount>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VtableCount {
    /// Vtable address relative to the module base.
    pub rva: u64,
    pub count: u64,
}

/// Scans the writable memory of `module` for object arrays. Only reads memory.
pub fn scan_object_arrays(process: &Process, module: &Module, opts: &ScanOptions) -> Vec<ArrayCandidate> {
    let mut found: BTreeMap<u64, ArrayCandidate> = BTreeMap::new();
    let mut rejected: HashSet<(u64, u64)> = HashSet::new();

    for region in regions(process, module.base, module.end()).iter().filter(|r| r.is_writable()) {
        let data = read_region(process, region);
        for off in (0..data.len().saturating_sub(15)).step_by(8) {
            let begin = u64_at(&data, off);
            let end = u64_at(&data, off + 8);
            if !plausible_pair(begin, end, module, opts) || rejected.contains(&(begin, end)) {
                continue;
            }
            let pair_rva = region.base + off as u64 - module.base;
            if let Some(known) = found.get_mut(&begin) {
                if known.end == end {
                    known.pair_rvas.push(pair_rva);
                }
                continue;
            }
            let count = (end - begin) / 8;
            if !looks_like_object_array(process, module, begin, count, opts.samples) {
                rejected.insert((begin, end));
                continue;
            }
            found.insert(
                begin,
                ArrayCandidate { pair_rvas: vec![pair_rva], begin, end, count, inspected: 0, vtables: Vec::new() },
            );
        }
    }

    let mut arrays: Vec<ArrayCandidate> = found.into_values().collect();
    for array in &mut arrays {
        census(process, module, array, opts.census_limit);
    }
    arrays.sort_by_key(|a| std::cmp::Reverse(a.count));
    arrays
}

/// Reads a whole region, falling back to page-by-page reads that leave unreadable pages zeroed.
fn read_region(process: &Process, region: &Region) -> Vec<u8> {
    if let Ok(data) = process.read_bytes(region.base, region.size as usize) {
        return data;
    }
    const PAGE: usize = 0x1000;
    let mut data = vec![0u8; region.size as usize];
    for (i, page) in data.chunks_mut(PAGE).enumerate() {
        if process.read_into(region.base + (i * PAGE) as u64, page).is_err() {
            page.fill(0);
        }
    }
    data
}

fn plausible_pair(begin: u64, end: u64, module: &Module, opts: &ScanOptions) -> bool {
    if end <= begin || !is_heap_pointer(begin, module) || !is_heap_pointer(end, module) {
        return false;
    }
    let bytes = end - begin;
    bytes.is_multiple_of(8) && (opts.min_count..=opts.max_count).contains(&(bytes / 8))
}

/// A user-mode pointer that does not point into the module itself.
fn is_heap_pointer(p: u64, module: &Module) -> bool {
    is_user_pointer(p) && !module.contains(p)
}

/// Samples elements spread over the array: at least 90% must point at objects whose
/// first field, the vtable, points back into the module.
fn looks_like_object_array(process: &Process, module: &Module, begin: u64, count: u64, samples: u64) -> bool {
    let n = samples.clamp(1, count);
    let mut good = 0;
    for k in 0..n {
        let index = k * count / n;
        let Ok(element) = process.read_u64(begin + index * 8) else {
            return false;
        };
        if is_heap_pointer(element, module) && process.read_u64(element).is_ok_and(|vt| module.contains(vt)) {
            good += 1;
        }
    }
    good * 10 >= n * 9
}

/// Counts the vtables of (up to `limit`) elements of `array`.
fn census(process: &Process, module: &Module, array: &mut ArrayCandidate, limit: u64) {
    let n = array.count.min(limit);
    let Ok(raw) = process.read_bytes(array.begin, (n * 8) as usize) else {
        return;
    };
    let mut counts: HashMap<u64, u64> = HashMap::new();
    for chunk in raw.as_chunks::<8>().0 {
        let element = u64::from_le_bytes(*chunk);
        if !is_heap_pointer(element, module) {
            continue;
        }
        if let Ok(vtable) = process.read_u64(element)
            && module.contains(vtable)
        {
            *counts.entry(vtable - module.base).or_default() += 1;
        }
    }
    let mut vtables: Vec<VtableCount> = counts.into_iter().map(|(rva, count)| VtableCount { rva, count }).collect();
    vtables.sort_by(|a, b| b.count.cmp(&a.count).then(a.rva.cmp(&b.rva)));
    vtables.truncate(8);
    array.inspected = n;
    array.vtables = vtables;
}

fn u64_at(bytes: &[u8], off: usize) -> u64 {
    u64::from_le_bytes(bytes[off..off + 8].try_into().expect("8 bytes"))
}

/// A `(begin, end)` pair that brackets a heap array of fixed-size records, e.g. a table whose rows are
/// 0x88 bytes each.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StridedArray {
    /// RVAs of every place in the module where this pair is stored.
    pub pair_rvas: Vec<u64>,
    pub begin: u64,
    pub end: u64,
    /// Records the pair brackets.
    pub count: u64,
    /// The first two records, to read the record's shape.
    pub head: Vec<u8>,
}

/// Scans the writable memory of `module` for `(begin, end)` pairs whose array holds `stride`-byte
/// records. A table the game keeps in one allocation shows up as one such pair; nothing about the
/// records is assumed, so this finds plain data as well as arrays of objects. Only reads memory.
pub fn scan_strided_arrays(
    process: &Process,
    module: &Module,
    stride: u64,
    min_count: u64,
    max_count: u64,
) -> Vec<StridedArray> {
    if stride == 0 {
        return Vec::new();
    }
    let mut found: BTreeMap<(u64, u64), StridedArray> = BTreeMap::new();
    for region in regions(process, module.base, module.end()).iter().filter(|r| r.is_writable()) {
        let data = read_region(process, region);
        for off in (0..data.len().saturating_sub(15)).step_by(8) {
            let begin = u64_at(&data, off);
            let end = u64_at(&data, off + 8);
            if end <= begin || !is_heap_pointer(begin, module) || !is_heap_pointer(end, module) {
                continue;
            }
            let bytes = end - begin;
            if !bytes.is_multiple_of(stride) {
                continue;
            }
            let count = bytes / stride;
            if !(min_count..=max_count).contains(&count) {
                continue;
            }
            let pair_rva = region.base + off as u64 - module.base;
            found
                .entry((begin, end))
                .or_insert_with(|| StridedArray { pair_rvas: Vec::new(), begin, end, count, head: Vec::new() })
                .pair_rvas
                .push(pair_rva);
        }
    }
    let mut arrays: Vec<StridedArray> = found.into_values().collect();
    for array in &mut arrays {
        let want = (stride * 2).min(0x400) as usize;
        array.head = process.read_bytes(array.begin, want).unwrap_or_default();
    }
    arrays.sort_by_key(|a| std::cmp::Reverse(a.count));
    arrays
}
