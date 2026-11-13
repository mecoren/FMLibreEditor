// The tables of editable fields, which the profiles and the Changes view share, and the objects a field that points at
// one can be set to: the nations, and the cities a city of birth can be.

import { editFields, listNations } from "./editing";
import { nameCities, nameNations } from "./labels";
import { birthCities } from "./scoutApi";
import type { City, EditField, Entity, Nation } from "./types";

const tables = new Map<Entity, Promise<EditField[]>>();
let nations: Promise<Nation[]> | null = null;
let cities: Promise<City[]> | null = null;

/**
 * The editable fields of players, of staff or of clubs. The table never changes during a connection, so it is
 * fetched once.
 */
export function fieldTable(entity: Entity): Promise<EditField[]> {
  let table = tables.get(entity);
  if (table === undefined) {
    const fetched = editFields(entity).then(withNations);
    table = fetched;
    tables.set(entity, fetched);
    // A failed fetch is not kept: the next call asks again.
    fetched.catch(() => {
      if (tables.get(entity) === fetched) {
        tables.delete(entity);
      }
    });
  }
  return table;
}

/**
 * The nations a nation field can be set to, by name. The game has no list of nations of its own: they are the nations
 * of the people in the lists. Fetched once a connection, and named for the select and for the change log.
 */
export function nationList(): Promise<Nation[]> {
  if (nations === null) {
    const fetched = listNations().then((list) => {
      nameNations(list);
      return list;
    });
    nations = fetched;
    fetched.catch(() => {
      if (nations === fetched) {
        nations = null;
      }
    });
  }
  return nations;
}

/**
 * The cities a city of birth can be set to: the ones the players of the save were born in, by name. Fetched once a
 * connection, and named for the change log.
 */
export function birthCityList(): Promise<City[]> {
  if (cities === null) {
    const fetched = birthCities().then((list) => {
      nameCities(list);
      return list;
    });
    cities = fetched;
    fetched.catch(() => {
      if (cities === fetched) {
        cities = null;
      }
    });
  }
  return cities;
}

/**
 * The table with the nations its nation field can be set to as the field's choices, so that it is picked from a
 * select by name.
 */
async function withNations(table: EditField[]): Promise<EditField[]> {
  if (!table.some((field) => field.key === "nation")) {
    return table;
  }
  const choices = (await nationList()).map((nation) => nation.address);
  return table.map((field) => (field.key === "nation" ? { ...field, choices } : field));
}

/** Forgets the tables and the lists, for the next connection. */
export function forgetFieldTables(): void {
  tables.clear();
  nations = null;
  cities = null;
}
