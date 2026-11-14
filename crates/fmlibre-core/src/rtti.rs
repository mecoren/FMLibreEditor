//! C++ classes by name. The compiler keeps the name of every class with virtual functions, and the game's objects of
//! such a class start with a pointer to its vtable: so the vtables of a class can be found from its name, and its
//! objects from the vtables. Some of the game's data, such as the season's statistics, hangs off nothing the editor
//! reads otherwise.
//!
//! The macOS build follows the Itanium C++ ABI: a vtable is preceded by the offset to the top of the object and a
//! pointer to the class's type info, whose second word points at the mangled name ("15GAME_COMP_STATS",
//! "N2db4TEAME"). On Apple silicon the compiler may set the top bit of that pointer, for a name that is not unique.
//!
//! Windows builds keep MSVC's descriptors instead: a vtable is preceded by a pointer to its complete object locator,
//! which names the class's type descriptor by its offset in the module, and the descriptor holds the mangled name
//! (".?AVGAME_COMP_STATS@@", ".?AVTEAM@db@@") after a vtable pointer and a spare word.

use std::collections::HashMap;
#[cfg(windows)]
use std::ops::Range;
use std::sync::atomic::{AtomicUsize, Ordering};

use fmlibre_mem::{Module, Process, Region, regions};
use memchr::memmem;

/// Bytes read at a time: a stretch small enough that what a thread reads is still in its processor's cache when it
/// looks through it, which makes a pass over the game's memory several times quicker than one read in stretches of
/// megabytes and looked through afterwards.
const CHUNK: u64 = 1 << 20;

/// The most threads that read the game's memory at once: a pass over it is several times quicker split between a few,
/// and the machine's every core is left to the game.
const READERS: usize = 8;

/// The top bit an Apple silicon build may set in a type info's name pointer.
#[cfg(target_os = "macos")]
const NON_UNIQUE: u64 = 1 << 63;

/// The bytes of a complete object locator (MSVC, x64): signature 1, the offset of the vtable in the object, a
/// constructor displacement, then the offsets in the module of the type descriptor (at +12), of the class hierarchy
/// and of the locator itself (at +20).
#[cfg(windows)]
const LOCATOR: usize = 24;

/// Where a type descriptor (MSVC) holds the class's name: after the pointer to `type_info`'s vtable and a spare word.
#[cfg(windows)]
const DESCRIPTOR_NAME: u64 = 0x10;

/// The name the compiler keeps for `class` (as written in C++, e.g. `db::TEAM`) in this build: [`itanium_name`] on
/// macOS, [`msvc_name`] on Windows.
pub fn mangled(class: &str) -> String {
    if cfg!(target_os = "macos") { itanium_name(class) } else { msvc_name(class) }
}

/// The Itanium mangled name of a class: `GAME_COMP_STATS` is `15GAME_COMP_STATS`, `db::TEAM` is `N2db4TEAME`.
pub fn itanium_name(class: &str) -> String {
    let parts: Vec<String> = class.split("::").map(|part| format!("{}{part}", part.len())).collect();
    match parts.as_slice() {
        [single] => single.clone(),
        _ => format!("N{}E", parts.concat()),
    }
}

/// MSVC's name of a class: `GAME_COMP_STATS` is `.?AVGAME_COMP_STATS@@`, `db::TEAM` is `.?AVTEAM@db@@`. A template's
/// name (`?$…`, as the probe's `types` lists it) is kept as it is.
pub fn msvc_name(class: &str) -> String {
    if class.starts_with("?$") {
        return format!(".?AV{class}@@");
    }
    let mut parts: Vec<&str> = class.split("::").collect();
    parts.reverse();
    format!(".?AV{}@@", parts.join("@"))
}

/// The address points of the vtables the compiler made for `class` (as written in C++, e.g. `db::TEAM`): what the
/// first word of its objects holds. Only the vtables of whole objects, not those of a base inside another class.
#[cfg(target_os = "macos")]
pub fn vtables(process: &Process, plugin: &Module, class: &str) -> Vec<u64> {
    let name = itanium_name(class);
    let needle: Vec<u8> = name.bytes().chain([0]).collect();
    // Every place the name ends with its NUL. What comes before it does not tell whether it starts there: the linker
    // puts some names right after other bytes, with no NUL between (`game_plugin::GAME_UI` follows random-looking
    // text on Steam build 26385295), and a name can end a longer one ("P15X" is a pointer's). The type info that
    // points at it tells: a longer name's points at where that one starts.
    let names: Vec<u64> = each_chunk(process, plugin.base, plugin.end(), needle.len(), |base, bytes, limit| {
        let finder = memmem::Finder::new(&needle);
        finder.find_iter(bytes).filter(|&at| at < limit).map(|at| base + at as u64).collect::<Vec<u64>>()
    })
    .concat();
    if names.is_empty() {
        return Vec::new();
    }
    let named: Vec<u64> = names.iter().flat_map(|&name| [name, name | NON_UNIQUE]).collect();
    // A type info's second word is the name pointer.
    let infos: Vec<u64> =
        words_equal_to(process, plugin.base, plugin.end(), &named).into_iter().map(|at| at - 8).collect();
    // A vtable's type info slot follows the offset to the top of the object, 0 for a whole object.
    words_equal_to(process, plugin.base, plugin.end(), &infos)
        .into_iter()
        .filter(|&at| process.read_u64(at - 8).is_ok_and(|top| top == 0))
        .map(|at| at + 8)
        .collect()
}

/// The address points of the vtables the compiler made for `class` (as written in C++, e.g. `db::TEAM`, a class or a
/// struct): what the first word of its objects holds. Only the vtables of whole objects, not those of a base inside
/// another class.
#[cfg(windows)]
pub fn vtables(process: &Process, plugin: &Module, class: &str) -> Vec<u64> {
    let name = msvc_name(class);
    // A struct's name starts ".?AU" where a class's starts ".?AV".
    let needles: Vec<Vec<u8>> =
        [name.clone(), name.replacen(".?AV", ".?AU", 1)].iter().map(|name| name.bytes().chain([0]).collect()).collect();
    let descriptors: Vec<u64> =
        each_chunk(process, plugin.base, plugin.end(), needles[0].len(), |base, bytes, limit| {
            let mut found = Vec::new();
            for needle in &needles {
                for at in memmem::find_iter(bytes, needle).filter(|&at| at < limit) {
                    // Descriptors are 8-byte aligned.
                    let descriptor = (base + at as u64).wrapping_sub(DESCRIPTOR_NAME);
                    if descriptor.is_multiple_of(8) && plugin.contains(descriptor) {
                        found.push(descriptor - plugin.base);
                    }
                }
            }
            found
        })
        .concat();
    if descriptors.is_empty() {
        return Vec::new();
    }
    // The locators of the class's whole objects: the vtable at offset 0 in the object.
    let locators: Vec<u64> = each_chunk(process, plugin.base, plugin.end(), LOCATOR, |base, bytes, limit| {
        let mut found = Vec::new();
        let words: Vec<u32> = bytes.as_chunks::<4>().0.iter().map(|word| u32::from_le_bytes(*word)).collect();
        for start in 0..words.len().saturating_sub(LOCATOR / 4 - 1) {
            let locator = base + 4 * start as u64;
            if 4 * start < limit
                && descriptors.contains(&u64::from(words[start + 3]))
                && words[start] == 1
                && words[start + 1] == 0
                && u64::from(words[start + 5]) == locator - plugin.base
            {
                found.push(locator);
            }
        }
        found
    })
    .concat();
    // A vtable is preceded by a pointer to its locator.
    words_equal_to(process, plugin.base, plugin.end(), &locators).into_iter().map(|at| at + 8).collect()
}

/// The mangled name of the class of the object at `object` (see [`mangled`]); `None` when its first word is not a
/// vtable of `plugin`.
#[cfg(target_os = "macos")]
pub fn class_of(process: &Process, plugin: &Module, object: u64) -> Option<String> {
    let vtable = process.read_u64(object).ok()?;
    if !plugin.contains(vtable) {
        return None;
    }
    let info = process.read_u64(vtable - 8).ok()?;
    let name = process.read_u64(info + 8).ok()? & !NON_UNIQUE;
    if !plugin.contains(name) {
        return None;
    }
    let bytes = process.read_bytes(name, 128).ok()?;
    let end = bytes.iter().position(|&b| b == 0)?;
    String::from_utf8(bytes[..end].to_vec()).ok()
}

/// The mangled name of the class of the object at `object` (see [`mangled`]); `None` when its first word is not a
/// vtable of `plugin`.
#[cfg(windows)]
pub fn class_of(process: &Process, plugin: &Module, object: u64) -> Option<String> {
    let vtable = process.read_u64(object).ok()?;
    if !plugin.contains(vtable) {
        return None;
    }
    let locator = process.read_u64(vtable - 8).ok().filter(|&at| plugin.contains(at))?;
    let bytes = process.read_bytes(locator, LOCATOR).ok()?;
    let word = |at: usize| u32::from_le_bytes(bytes[at..at + 4].try_into().expect("4 bytes"));
    if word(0) != 1 || u64::from(word(20)) != locator - plugin.base {
        return None;
    }
    let name = process.read_bytes(plugin.base + u64::from(word(12)) + DESCRIPTOR_NAME, 128).ok()?;
    let end = name.iter().position(|&b| b == 0)?;
    String::from_utf8(name[..end].to_vec()).ok()
}

/// The objects on the game's heap whose first word is one of `vtables`, by vtable. One pass over every page of data
/// the game has allocated, which takes the reading of gigabytes of it: made by a few threads at once, each reading a
/// stretch small enough that it is still in its processor's cache when it is looked through. The threads' stacks are
/// left out: they hold only copies a function made for a while. Fails when the stacks cannot be told apart.
pub fn objects(process: &Process, plugin: &Module, vtables: &[u64]) -> fmlibre_mem::Result<HashMap<u64, Vec<u64>>> {
    let mut found: HashMap<u64, Vec<u64>> = vtables.iter().map(|&vtable| (vtable, Vec::new())).collect();
    if vtables.is_empty() {
        return Ok(found);
    }
    let stacks = Stacks::of(process)?;
    // The stretches of the game's data memory to look through, a chunk each: a pointer is a whole word of its own, so
    // a chunk is read without overlap.
    let mut jobs: Vec<(u64, usize, usize)> = Vec::new();
    for region in regions(process, 0x1_0000, 0x7FFF_FFFF_0000).into_iter().filter(|r| r.holds_data() && !stacks.hold(r))
    {
        if plugin.contains(region.base) {
            continue;
        }
        let mut offset = 0;
        while offset < region.size {
            let len = (region.size - offset).min(CHUNK) as usize;
            jobs.push((region.base + offset, len, len));
            offset += CHUNK;
        }
    }
    let hits = read_jobs(process, &jobs, |base, bytes, _| {
        let mut hits: Vec<(usize, u64)> = Vec::new();
        for (i, word) in bytes.as_chunks::<8>().0.iter().enumerate() {
            // Against each vtable in turn: there are a handful of them, and hashing every word of the game's heap
            // costs more than the few comparisons.
            let word = u64::from_le_bytes(*word);
            if let Some(index) = vtables.iter().position(|&vtable| vtable == word) {
                hits.push((index, base + (i * 8) as u64));
            }
        }
        hits
    });
    for (index, address) in hits.into_iter().flatten() {
        found.get_mut(&vtables[index]).expect("a vtable asked for").push(address);
    }
    // The objects of a class come in the order of the memory they sit in, as the pass that read them one at a time
    // left them: a competition's table is the first of its stages read.
    for addresses in found.values_mut() {
        addresses.sort_unstable();
    }
    Ok(found)
}

/// The threads' stacks, which macOS tags as such.
#[cfg(target_os = "macos")]
struct Stacks;

#[cfg(target_os = "macos")]
impl Stacks {
    fn of(_process: &Process) -> fmlibre_mem::Result<Self> {
        Ok(Self)
    }

    fn hold(&self, region: &Region) -> bool {
        const VM_MEMORY_STACK: u32 = 30;
        region.user_tag == VM_MEMORY_STACK
    }
}

/// The threads' stacks, which Windows does not tag: each thread's environment block says where its stack is (see
/// [`fmlibre_mem::thread_stacks`]).
#[cfg(windows)]
struct Stacks(Vec<Range<u64>>);

#[cfg(windows)]
impl Stacks {
    fn of(process: &Process) -> fmlibre_mem::Result<Self> {
        fmlibre_mem::thread_stacks(process).map(Self)
    }

    fn hold(&self, region: &Region) -> bool {
        self.0.iter().any(|stack| stack.contains(&region.base))
    }
}

/// Calls `visit` with each readable stretch of `[start, end)`, `overlap` bytes longer than the part it should look at
/// (`limit`), so that a pattern across two stretches is seen once. The stretches are read by a few threads at once, and
/// what `visit` makes of each is collected, in no particular order.
fn each_chunk<T: Send>(
    process: &Process,
    start: u64,
    end: u64,
    overlap: usize,
    visit: impl Fn(u64, &[u8], usize) -> T + Sync,
) -> Vec<T> {
    let mut jobs: Vec<(u64, usize, usize)> = Vec::new();
    for region in regions(process, start, end).into_iter().filter(|r| r.is_readable()) {
        let mut offset = 0;
        while offset < region.size {
            let base = region.base + offset;
            let limit = (region.size - offset).min(CHUNK);
            let len = (region.size - offset).min(CHUNK + overlap as u64);
            jobs.push((base, len as usize, limit as usize));
            offset += CHUNK;
        }
    }
    read_jobs(process, &jobs, visit)
}

/// Reads each of `jobs` — where it starts, how many bytes to read, how many of them to look at — on a few threads at
/// once, and collects what `visit` makes of those that could be read whole. Nothing is kept in order.
fn read_jobs<T: Send>(
    process: &Process,
    jobs: &[(u64, usize, usize)],
    visit: impl Fn(u64, &[u8], usize) -> T + Sync,
) -> Vec<T> {
    let next = AtomicUsize::new(0);
    let (next, visit) = (&next, &visit);
    std::thread::scope(|scope| {
        let readers: Vec<_> = (0..readers().min(jobs.len()))
            .map(|_| {
                scope.spawn(move || {
                    let mut found = Vec::new();
                    // A pass reads gigabytes: each thread keeps the buffer it read the stretch before, rather than
                    // taking a fresh one, zeroed, at every stretch of them.
                    let mut buffer = Vec::new();
                    loop {
                        let index = next.fetch_add(1, Ordering::Relaxed);
                        let Some(&(base, len, limit)) = jobs.get(index) else {
                            break;
                        };
                        if buffer.len() < len {
                            buffer.resize(len, 0);
                        }
                        let bytes = &mut buffer[..len];
                        if process.read_into(base, bytes).is_ok() {
                            found.push(visit(base, bytes, limit));
                        }
                    }
                    found
                })
            })
            .collect();
        readers.into_iter().flat_map(|reader| reader.join().expect("a reader of the game's memory")).collect()
    })
}

/// How many threads read the game's memory at once: this machine's cores, and no more than [`READERS`].
fn readers() -> usize {
    std::thread::available_parallelism().map_or(1, |cores| cores.get()).min(READERS)
}

/// The addresses of the 8-byte aligned words in `[start, end)` that hold one of `values`.
fn words_equal_to(process: &Process, start: u64, end: u64, values: &[u64]) -> Vec<u64> {
    each_chunk(process, start, end, 0, |base, bytes, _| {
        let mut found = Vec::new();
        for (i, word) in bytes.as_chunks::<8>().0.iter().enumerate() {
            if values.contains(&u64::from_le_bytes(*word)) {
                found.push(base + (i * 8) as u64);
            }
        }
        found
    })
    .concat()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_mangled_as_the_compiler_keeps_them() {
        assert_eq!(itanium_name("GAME_COMP_STATS"), "15GAME_COMP_STATS");
        assert_eq!(itanium_name("db::TEAM"), "N2db4TEAME");
        assert_eq!(itanium_name("sicomps::FRIENDLY_ACTUAL_COMP"), "N7sicomps20FRIENDLY_ACTUAL_COMPE");
        assert_eq!(msvc_name("RETIREMENT_MANAGER"), ".?AVRETIREMENT_MANAGER@@");
        assert_eq!(msvc_name("db::TEAM"), ".?AVTEAM@db@@");
        assert_eq!(
            msvc_name("simatch::PREPARED_TACTICS_CREATOR_ARRAY"),
            ".?AVPREPARED_TACTICS_CREATOR_ARRAY@simatch@@"
        );
    }

    /// A class's name right after other bytes, as game_plugin keeps `game_plugin::GAME_UI`'s, is found by the type
    /// info that points at it; the same name ending a pointer's name, whose type info points at its start, is not.
    #[cfg(target_os = "macos")]
    #[test]
    fn a_name_right_after_other_bytes_is_found_by_its_type_info() {
        // A page of the test's own memory stands in for the plugin: a region of its own, so that what is searched is
        // only what is laid out below, as a plugin's regions hold only the plugin.
        let process = Process::open_read_write(std::process::id()).expect("open this process");
        let base = process.allocate(4096).expect("a page of its own");
        let mut bytes = vec![0u8; 24 * 8];
        let mut put = |at: usize, data: &[u8]| bytes[at..at + data.len()].copy_from_slice(data);
        put(0, b"lzm9LpyN4test7GAME_UIE\0"); // the class's name at 7
        put(32, b"PN4test7GAME_UIE\0"); // a pointer's name at 32, ending with the same bytes
        // The class's type info at 64 and the pointer's at 80: a pointer out of the plugin, then the name. A vtable of
        // each, at 96 and 128: the offset to the top of the object, the type info, then a function.
        let runtime = 0x1_0000_0000_u64;
        for (at, word) in [(64, runtime), (72, base + 7), (80, runtime), (88, base + 32)] {
            put(at, &word.to_le_bytes());
        }
        for (at, word) in [(96, 0), (104, base + 64), (112, runtime), (128, 0), (136, base + 80), (144, runtime)] {
            put(at, &word.to_le_bytes());
        }
        process.write_bytes(base, &bytes).expect("lay the bytes out");
        let plugin = Module { name: "test".to_owned(), base, size: 4096, path: std::path::PathBuf::new() };
        // The vtable's address point, after its type info.
        assert_eq!(vtables(&process, &plugin, "test::GAME_UI"), vec![base + 112]);
    }

    /// The objects whose first word is one of the vtables asked for are found wherever they sit in the data memory of
    /// a process, the last word of a stretch and the first of the next among them, and the addresses of a class's come
    /// in the order of the memory: the stretches are read by several threads at once, and what each finds is put back
    /// in that order.
    #[test]
    fn objects_are_found_in_the_data_memory() {
        let process = Process::open_read_write(std::process::id()).expect("open this process");
        // Words of the test's own, with "objects" at the ends of two of the stretches read, a megabyte each.
        let length = 2 * CHUNK as usize;
        let base = process.allocate(length).expect("memory of its own");
        let first = 0x0000_7FF8_0000_1000_u64;
        let second = 0x0000_7FF8_0000_2000_u64;
        let mut words = vec![0u8; length];
        let mut put = |at: usize, word: u64| words[at..at + 8].copy_from_slice(&word.to_le_bytes());
        put(CHUNK as usize - 8, first);
        put(CHUNK as usize, first);
        put(CHUNK as usize + 8, second);
        put(2 * CHUNK as usize - 8, second);
        process.write_bytes(base, &words).expect("lay the objects out");
        // The plugin's own memory is left out of the pass: a range no memory of the test's is in.
        let plugin = Module { name: "test".to_owned(), base: 0, size: 1, path: std::path::PathBuf::new() };
        let found = objects(&process, &plugin, &[first, second]).expect("read this process");
        // The words read are not the only copies in the test: the buffer they were laid out from has them too, so
        // only what was found where they were laid out is looked at.
        let laid = |vtable: u64| -> Vec<u64> {
            found[&vtable].iter().copied().filter(|at| (base..base + length as u64).contains(at)).collect()
        };
        assert_eq!(laid(first), vec![base + CHUNK - 8, base + CHUNK]);
        assert_eq!(laid(second), vec![base + CHUNK + 8, base + 2 * CHUNK - 8]);
    }
}
