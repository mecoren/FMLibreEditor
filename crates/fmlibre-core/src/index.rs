use std::collections::HashMap;

use crate::text::fold;

/// Something the app lists: found by name or id, best first.
pub trait Listed {
    fn uid(&self) -> u32;
    /// Every name the item can be found by, separated by spaces.
    fn names(&self) -> String;
    fn display_name(&self) -> &str;
    /// Higher ranks come first in search results.
    fn rank(&self) -> i32;
}

/// Items with an accent- and case-insensitive name index.
pub struct SearchIndex<T> {
    items: Vec<T>,
    /// Every name of each item, folded for matching.
    folded: Vec<String>,
    /// Each item's display name, folded for ordering, so "Özil" sorts with the O's.
    sort_names: Vec<String>,
    by_uid: HashMap<u32, usize>,
}

impl<T: Listed> SearchIndex<T> {
    pub fn new(items: Vec<T>) -> Self {
        let folded = items.iter().map(|item| fold(&item.names())).collect();
        let sort_names = items.iter().map(|item| fold(item.display_name())).collect();
        let by_uid = items.iter().enumerate().map(|(i, item)| (item.uid(), i)).collect();
        Self { items, folded, sort_names, by_uid }
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Every item, in the order they were read.
    pub fn iter(&self) -> impl Iterator<Item = &T> {
        self.items.iter()
    }

    pub fn get(&self, uid: u32) -> Option<&T> {
        self.by_uid.get(&uid).map(|&i| &self.items[i])
    }

    /// Changes the item with `uid` in place, e.g. after an edit; its names must stay the same.
    pub fn update(&mut self, uid: u32, change: impl FnOnce(&mut T)) -> bool {
        match self.by_uid.get(&uid) {
            Some(&i) => {
                change(&mut self.items[i]);
                true
            }
            None => false,
        }
    }

    /// Changes the item with `uid` in place and indexes its names again, e.g. after it was given another name.
    pub fn rename(&mut self, uid: u32, change: impl FnOnce(&mut T)) -> bool {
        match self.by_uid.get(&uid) {
            Some(&i) => {
                change(&mut self.items[i]);
                self.folded[i] = fold(&self.items[i].names());
                self.sort_names[i] = fold(self.items[i].display_name());
                true
            }
            None => false,
        }
    }

    /// Items whose names contain every word of `query` (ignoring accents and case), or
    /// whose id equals it; highest rank first, then by name. An empty query matches everything.
    pub fn search(&self, query: &str) -> Vec<&T> {
        let uid: Option<u32> = query.trim().parse().ok();
        let words: Vec<String> = fold(query).split_whitespace().map(str::to_owned).collect();
        let mut hits: Vec<usize> = (0..self.items.len())
            .filter(|&i| uid == Some(self.items[i].uid()) || words.iter().all(|w| self.folded[i].contains(w.as_str())))
            .collect();
        hits.sort_by(|&a, &b| {
            let (a_item, b_item) = (&self.items[a], &self.items[b]);
            b_item
                .rank()
                .cmp(&a_item.rank())
                .then_with(|| self.sort_names[a].cmp(&self.sort_names[b]))
                .then_with(|| a_item.display_name().cmp(b_item.display_name()))
        });
        hits.into_iter().map(|i| &self.items[i]).collect()
    }
}
