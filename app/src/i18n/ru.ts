// The Russian text of the UI: the same shape as `en.ts` (a missing or extra key fails the build), in the Russian of
// Russia, whose conventions the dates and numbers follow too (see `index.ts`). It speaks to the user as "вы", as FM's
// Russian does. The comments in `en.ts` say what each string is for.
//
// Russian has three plural forms after a number: "1 игрок", "2 игрока", "5 игроков" (and 21 is like 1, 22 like 2, 11–14
// like 5); `plural` picks one. Where a count would have to change its case, the sentences put it after a colon instead.

import type { Entity, OpportunityKind } from "../types";
import type { ErrorTexts, Strings } from "./en";
import { fieldName } from "./fieldNames";

const numbers = new Intl.NumberFormat("ru-RU");
const percents = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

/** A count or an amount with the thousands separators of the language: "12 345". */
const format = (value: number) => numbers.format(value);

/** The form of a noun after `count`: `one` for 1, 21, 31…; `few` for 2–4, 22–24…; `many` for 0, 5–20, 25–30… */
const plural = (count: number, one: string, few: string, many: string) => {
  const tens = Math.abs(count) % 100;
  const units = tens % 10;
  if (tens >= 11 && tens <= 14) {
    return many;
  }
  if (units === 1) {
    return one;
  }
  return units >= 2 && units <= 4 ? few : many;
};

/** A count and its noun: "1 игрок", "3 игрока", "12 345 игроков". */
const counted = (count: number, one: string, few: string, many: string) =>
  `${format(count)} ${plural(count, one, few, many)}`;

/** "1 изменение", "3 изменения", "12 изменений". */
const changes = (count: number) => counted(count, "изменение", "изменения", "изменений");

/** "Нет изменений", "1 изменение", "3 изменения". */
const changeCount = (count: number) => (count === 0 ? "Нет изменений" : changes(count));

/** "1 игрок", "12 игроков". */
const playerCount = (count: number) => counted(count, "игрок", "игрока", "игроков");

/** "1 значение не изменится", "12 значений не изменятся". */
const valuesLeftAlone = (count: number) =>
  count % 10 === 1 && count % 100 !== 11
    ? `${format(count)} значение не изменится`
    : `${counted(count, "значение", "значения", "значений")} не изменятся`;

/** The noun of each list in its three forms after a number, and in the genitive after "из". */
const nouns: Record<Entity, { one: string; few: string; many: string; genOne: string; genMany: string }> = {
  player: { one: "игрок", few: "игрока", many: "игроков", genOne: "игрока", genMany: "игроков" },
  staff: { one: "сотрудник", few: "сотрудника", many: "сотрудников", genOne: "сотрудника", genMany: "сотрудников" },
  club: { one: "клуб", few: "клуба", many: "клубов", genOne: "клуба", genMany: "клубов" },
};

/** "237 игроков", "1 сотрудник", "12 клубов". */
const entityCount = (entity: Entity, count: number) =>
  counted(count, nouns[entity].one, nouns[entity].few, nouns[entity].many);

/** After "из", in the genitive: "из 237 игроков", "из 1 клуба". */
const entityGenitive = (entity: Entity, count: number) =>
  `${format(count)} ${count % 10 === 1 && count % 100 !== 11 ? nouns[entity].genOne : nouns[entity].genMany}`;

/** What each list holds, in the genitive plural. */
const entityNouns: Record<Entity, string> = { player: "игроков", staff: "сотрудников", club: "клубов" };

/** Squad statuses, by the codes contracts hold them as (see `en.ts`). */
const SQUAD_STATUSES: Partial<Record<number, string>> = {
  1: "Звезда команды",
  2: "Важный игрок",
  3: "Игрок основы",
  4: "Игрок ротации",
  5: "Игрок для замен",
  7: "Запасной игрок",
  9: "Глубокий резерв",
  10: "Готов к прорыву",
  11: "Перспективный игрок",
  13: "Молодой игрок",
  14: "Игрок второй команды",
  15: "Основной вратарь",
  16: "Вратарь на кубки",
  17: "Вратарь на национальный кубок",
  20: "Запасной",
  21: "Глубокий резерв (вратарь)",
  22: "Не нужен клубу",
};

/** The kinds of contract, by the codes contracts hold them as; 8, 10 and 11 are the MLS's, and the game
 * shows 8 and 11 under one name. */
const CONTRACT_TYPES: Partial<Record<number, string>> = {
  0: "Контракт с частичной занятостью",
  1: "Профессиональный контракт",
  2: "Любительский контракт",
  3: "Молодёжный контракт",
  4: "Без контракта",
  8: "Основной контракт",
  10: "Контракт с минимальной зарплатой",
  11: "Основной контракт",
};

/** The name of the field a failure names. */
const field = (key: string | undefined) => fieldName(ru, key ?? "");

/** What a check is about, from the key a failure gives, with a capital: "Контракты". */
const checkName = (key: string | undefined) => {
  const name = (ru.checks as Partial<Record<string, string>>)[key ?? ""] ?? key ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** The name of a job by its code, as a failure gives it. */
const jobName = (code: string | undefined) => (ru.jobs as Partial<Record<number, string>>)[Number(code)] ?? code;

/** The noun of the kind of record a failure names. */
const recordNoun = (entity: string | undefined) =>
  entity === "player" ? "игрок" : entity === "staff" ? "сотрудник" : entity === "club" ? "клуб" : "запись";

/** The reasons the Rust side gives for a field that cannot be changed some way. */
const UNSUPPORTED: Partial<Record<string, string>> = {
  "a date can only be set": "дату можно только задать",
  "it is changed one person at a time": "это меняется только для одного человека за раз",
  "the new value is not one of the game's own records of that kind":
    "новое значение не является записью игры такого типа",
  "the in-game date is not known": "игровая дата неизвестна",
};

const reload = "перезагрузите данные и попробуйте снова";

/** The lists of a club's staff, as `staff.noRoom` names them. */
const STAFF_DEPARTMENTS: Partial<Record<string, string>> = {
  medical: "медицинского отдела",
  coaching: "тренерского штаба",
  scouting: "скаутского отдела",
};

const errors: ErrorTexts = {
  "guard.unknownBuild": () =>
    "FMLibreEditor не проверялся с этой версией игры, поэтому ничего в неё не записывает. Кнопка «Всё равно " +
    "редактировать» в уведомлении вверху включает редактирование.",
  "guard.failed": (p) =>
    `${checkName(p.check)}: проверка не пройдена в этой версии игры, поэтому FMLibreEditor не изменяет эти данные.`,
  "edit.unknownField": (p) => `Здесь нет редактируемого поля «${p.field}».`,
  "edit.outOfRange": (p) => `${p.value} — недопустимое значение для поля «${field(p.field)}»: допустимо от ${p.min} до ${p.max}.`,
  "edit.notADate": (p) => `${p.value} — это не дата для поля «${field(p.field)}».`,
  "edit.notAChoice": (p) => `${p.value} не входит в число значений поля «${field(p.field)}».`,
  "edit.taken": (p) => `Номер ${p.value} занят: его носит ${p.name ?? `игрок с UID ${p.uid}`}.`,
  "edit.unsupported": (p) =>
    `Поле «${field(p.field)}» нельзя изменить таким образом: ${UNSUPPORTED[p.reason] ?? p.reason}.`,
  "edit.moved": (p) => `Этот ${recordNoun(p.entity)} перемещён в памяти игры; ${reload}.`,
  "edit.noRecord": (p) =>
    `Поле «${field(p.field)}» нельзя изменить здесь: его запись отсутствует или не прошла проверку.`,
  "edit.unset": (p) => `Поле «${field(p.field)}» не задано в игре, поэтому оно не изменено.`,
  "edit.implausible": (p) =>
    `Поле «${field(p.field)}» содержит ${p.value}, что невозможно; для безопасности оно не изменено.`,
  "edit.notApplied": (p) => `${field(p.field)}: записано ${p.wrote}, но прочитано ${p.read}.`,
  "edit.conflict": (p) =>
    `${field(p.field)} теперь равно ${p.found}, а не ${p.expected}: игра успела изменить значение.`,
  "move.moved": () => `Игрок перемещён в памяти игры; ${reload}.`,
  "move.notAClub": () => "У этого клуба нет основной команды, в которую мог бы перейти игрок.",
  "move.freeAgent": () => "Игрок — свободный агент: у него нет клуба, который он мог бы покинуть или через который его можно обменять.",
  "move.sameClub": () => "Игрок уже в этом клубе.",
  "move.onLoan": () =>
    "Игрок в аренде: сначала верните его или выкупите в разделе «Аренда» его профиля.",
  "move.notOnLoan": () => "Игрок не в аренде.",
  "move.playerCoach": () => "Играющих тренеров нельзя переводить: они одновременно числятся сотрудниками.",
  "move.unusualContract": () => "Контракт игрока не является обычным контрактом игрока.",
  "move.humanClub": () =>
    "Игрок в клубе, которым управляет человек. В этой версии игры редактор пока не находит составы этого клуба, " +
    "чтобы убрать его оттуда, поэтому покинуть клуб он может только в самой игре.",
  "move.menAndWomen": () => "Один из клубов мужской, а другой — женский.",
  "move.notListed": () => "Игрока нет в списках состава там, где он должен быть.",
  "move.noRoom": (p) =>
    `В заявке клуба нет места для ещё одного игрока (сейчас ${p.players}), а редактор не может её расширить на этой ` +
    "системе.",
  "sign.noPool": () =>
    "Редактор не находит в этой версии игры, где игра хранит контракты, поэтому не может дать контракт свободному агенту.",
  "sign.poolFull": () =>
    "В игре нет места для ещё одного контракта, пока она сама не создаст новый, как это происходит со временем: " +
    "продвиньтесь в игре на один день и попробуйте снова.",
  "sign.noModel": () =>
    "В основной команде клуба нет игрока с обычным контрактом, по образцу которого можно составить новый.",
  "sign.noDate": () => "Редактор не может прочитать игровую дату, с которой начинается новый контракт.",
  "move.outOfRange": (p) =>
    `${p.value} — недопустимое значение для поля «${field(p.field)}»: допустимо от ${p.min} до ${p.max}.`,
  "move.changed": () => `Игра успела изменить эти данные; ${reload}.`,
  "move.notApplied": () => "Данные были записаны, но при повторном чтении там оказалось другое.",
  "retirement.unknown": () => "Редактор не находит запланированные завершения карьеры в этой версии игры.",
  "retirement.none": () => "Игра не планирует завершение карьеры этого игрока; он и так хочет играть дальше.",
  "clause.noContract": () => "У игрока нет контракта.",
  "clause.missing": () => `Этого пункта больше нет в контракте; ${reload}.`,
  "clause.notInClause": (p) =>
    `У этого пункта нет ${p.field === "clause.amount" ? "суммы" : "условия"}, которое можно изменить.`,
  "clause.same": () => "В контракте это уже есть.",
  "clause.noRoom": () =>
    "В списке пунктов контракта нет места, а редактор не может его расширить; вместо этого измените существующий пункт.",
  "heal.notInjured": () => "У игрока нет травм, которые можно вылечить.",
  "ban.notBanned": () => "У игрока нет дисквалификаций, которые можно снять.",
  "relation.missing": () => `Этого гражданства или места подготовки больше нет в списке игрока; ${reload}.`,
  "relation.noRoom": () =>
    "В списке игрока нет места, а редактор не может его расширить; вместо этого измените одну из записей.",
  "relation.target": () => "Это не страна и не клуб игры того вида, который принимает эта запись.",
  "relation.same": () => "У игрока это уже есть.",
  "relation.rule": (p) => `Правило доморощенности ${p.rule} не входит в число тех, что записывает редактор.`,
  "staff.you": () => "Это вы — менеджер, которым вы управляете.",
  "staff.unemployed": () => "У этого сотрудника нет клуба.",
  "staff.role": () =>
    "Клуб или одна из его команд ссылается на этого сотрудника напрямую (например, на тренера, который также " +
    "спортивный директор); таких игра переводит сама.",
  "staff.notListed": () => "Этого сотрудника нет в списках персонала клуба там, где он должен быть.",
  "staff.noRoom": (p) =>
    `В списке ${STAFF_DEPARTMENTS[p.department] ?? `отдела ${p.department}`} клуба нет места для ещё одного ` +
    `сотрудника (сейчас ${p.staff}), а редактор не может его здесь расширить.`,
  "names.unknown": () =>
    "Редактор не находит, где эта версия игры хранит имена людей, поэтому не может их менять.",
  "names.noRoom": (p) =>
    `В игре сейчас нет места для ещё одной записи вида «${({ first: "имя", last: "фамилия", common: "общепринятое имя" } as Record<string, string>)[p.table] ?? "имя"}». ` +
    "Игра освобождает место сама, когда приходят новые игроки и сотрудники; или сохраните игру, загрузите сохранение заново и попробуйте снова.",
  "names.same": () => "Это имя уже такое.",
  "names.bad": (p) =>
    `Имя и фамилия не могут быть пустыми, а никакое имя не может начинаться или заканчиваться пробелом, содержать управляющие символы или занимать больше ${p.max} байт.`,
  "stadium.none": () => "Не удаётся прочитать стадион, на котором играет основная команда клуба.",
  "stadium.shared": (p) =>
    `${p.holders} записей в игре используют это название; его нельзя изменить только для стадиона.`,
  "stadium.nameLength": (p) =>
    `Новое название стадиона должно занимать от ${p.min} до ${p.max} байт, чтобы поместиться там, где игра его ` +
    `хранит; это занимает ${p.bytes}.`,
  "stadium.badName": () =>
    "Название стадиона не может быть пустым, начинаться или заканчиваться пробелом или содержать управляющие символы.",
  "staff.job": (p) => `Редактор пока не переводит сотрудников с должностью «${jobName(p.job)}» и не назначает на неё.`,
  "staff.directorTaken": (p) =>
    `${p.name ?? "Другой человек"} уже спортивный директор клуба. Дайте этому сотруднику другую должность там ` +
    `или сначала переведите ${p.name ?? "его"}.`,
  "staff.managerTaken": (p) =>
    `${p.name ?? "Другой человек"} уже менеджер клуба. Дайте этому сотруднику другую должность там или сначала ` +
    `переведите ${p.name ?? "его"}.`,
  "staff.yourClub": () =>
    "Этим клубом руководите вы. Дайте этому сотруднику другую должность: FMLibreEditor никогда не занимает ваше место.",
  "staff.noJob": () => "Выберите должность, которую сотрудник займёт в клубе.",
  "staff.noModel": (p) =>
    p.staff === "0"
      ? "В этом клубе вообще нет персонала: игра не хранит его у клубов из лиг, недоступных для игры в этом сохранении."
      : "Ни у одного сотрудника этого клуба нет собственного полного контракта, по образцу которого можно составить новый.",
  "squad.noTeam": () => `У клуба нет этой команды, или она не прошла проверку; ${reload}.`,
  "captain.notInTeam": () =>
    "Игрок не играет в этой команде; капитаном может быть только игрок самой команды.",
  "captain.unchanged": () => "У игрока уже есть эта роль.",
  "session.notRunning": () =>
    "Football Manager 27 не запущен. Запустите игру, загрузите сохранение и попробуйте снова.",
  "session.noSuchProcess": (p) => `Нет процесса ${p.exe ?? "fm.exe"} с PID ${p.pid}.`,
  "session.severalRunning": (p) => `Запущено несколько копий ${p.exe ?? "fm.exe"} (${p.count}: ${p.pids}); выберите одну.`,
  "session.pluginNotLoaded": () =>
    "Данные игры ещё не загружены; дождитесь главного меню и попробуйте снова.",
  "session.unsupportedEdition": (p) => `FM${p.edition} пока не поддерживается.`,
  "session.unknownEdition": () => "Не удаётся определить, какой это Football Manager.",
  "session.playersNotFound": () =>
    "Список игроков не найден; загрузите сохранение (главного меню недостаточно) и попробуйте снова.",
  "memory.win32": (p) => `Windows отклонила операцию (${p.operation}, ошибка ${p.code}).`,
  "memory.read": (p) => `Не удалось прочитать память игры (системная ошибка ${p.code}).`,
  "memory.write": (p) => `Не удалось записать в память игры (системная ошибка ${p.code}).`,
  "memory.readOnly": () => "Игра открыта только для чтения; Windows не разрешила запись.",
  "memory.notWritable": () =>
    "Этот адрес не находится в записываемой памяти данных игры, поэтому запись не выполнена.",
  "memory.invalidPe": () => "Не удалось прочитать модуль игры.",
  "memory.invalidMachO": () => "Не удалось прочитать модуль игры.",
  "memory.mach": (p) => `macOS отклонила операцию (${p.operation}, ошибка ${p.code}).`,
  "memory.posix": (p) => `macOS отклонила операцию (${p.operation}, errno ${p.code}).`,
  "guard.saveChanged": () =>
    "С тех пор как FMLibreEditor прочитал игру, она загрузила сохранение или вернулась в главное меню, поэтому " +
    "редактор ничего не меняет, пока вы не перезагрузите данные.",
  "memory.noBridge": () =>
    "macOS не пускает FMLibreEditor в игру: игра запущена без моста FMLibreEditor. Настройте мост, затем снова " +
    "запустите игру из Steam.",
  "memory.bridge": (p) => `Мост FMLibreEditor в игре не передал память (${p.reason}).`,
  "scout.noClub": () => "В этом сохранении вы не руководите клубом, поэтому скаутить не для кого.",
  "scout.noTactic": (p) => `Не удалось прочитать из игры тактику клуба ${p.club}.`,
  "scout.notPlaced": () => "Игрок не стоит ни на одной позиции тактики.",
  "scout.unknownRole": (p) => `Редактор не знает роль ${p.role}.`,
  "setup.steamRunning": () =>
    "Steam запущен, поэтому параметры запуска FM27 не изменены; сам мост установлен. Закройте Steam и попробуйте " +
    "снова или введите параметр запуска в Steam сами.",
  "setup.noSteamAccount": () =>
    "На этом Mac не найдена учётная запись Steam; откройте Steam и войдите хотя бы один раз.",
  "setup.noLibrary": (p) => `В приложении отсутствует файл моста: ${p.path}`,
  "setup.unknownConfig": (p) => `${p.path} имеет формат, неизвестный FMLibreEditor, поэтому файл не изменён.`,
  "setup.io": (p) => `${p.path}: ${p.error}`,
  "app.internal": () => "В приложении произошла непредвиденная ошибка.",
  "app.notConnected": () => "Нет подключения к игре.",
  "app.notFound": (p) => `В списках нет записи (${recordNoun(p.entity)}) с ID ${p.uid}; перезагрузите данные.`,
  "app.dataChanged": () => `Эти данные изменились в игре; ${reload}.`,
  "app.noChange": (p) => `Изменения ${p.id} не существует.`,
  "app.alreadyUndone": () => "Это изменение уже отменено.",
  "export.failed": (p) => `Не удалось записать файл: ${p.reason}`,
  "export.notAllowed": (p) =>
    `FMLibreEditor не может записывать в ${p.folder}. Если macOS спрашивала, можно ли использовать папку «Документы», ` +
    "разрешите это в Системных настройках › Конфиденциальность и безопасность › Файлы и папки, затем экспортируйте снова.",
  "export.noFolder": () => "Нет папки, в которую можно экспортировать.",
  "export.notExported": () => "Этот файл экспортирован не FMLibreEditor.",
  "export.openFailed": (p) => `Не удалось открыть файл: ${p.reason}`,
  "mass.noOperations": () => "Выберите хотя бы одно поле для изменения.",
  "mass.tooMany": (p) =>
    `Найдено совпадений: ${p.count}. Для массового редактирования сузьте поиск или фильтры до ${p.limit}.`,
  "mass.outOfDate": () => "Этот предпросмотр устарел. Сделайте предпросмотр массового редактирования заново.",
};

/** The kinds of contract clauses and bonuses, by the codes contracts hold them as (see `en.ts`). */
const CLAUSE_NAMES_RU: Partial<Record<number, string>> = {
  0: "Отступные (минимальная сумма)",
  1: "Отступные при вылете",
  2: "Отступные при невыходе в высший дивизион",
  3: "Ежегодное повышение зарплаты",
  4: "Повышение зарплаты при повышении в классе",
  5: "Снижение зарплаты при вылете",
  6: "Отступные при предложении должности в персонале",
  8: "Процент от будущей продажи",
  9: "Процент от прибыли при будущей продаже",
  10: "Бонус за достижение числа голов за сезон",
  11: "Продление на год после матчей лиги (последний сезон)",
  12: "Зарплата на уровне самого высокооплачиваемого",
  13: "Зарплата после достижения числа матчей лиги за клуб",
  14: "Повышение зарплаты при выходе в высший дивизион",
  15: "Снижение зарплаты при вылете из высшего дивизиона",
  16: "Отступные (иностранные клубы)",
  17: "Отступные (клубы страны из более высокого дивизиона)",
  18: "Отступные (клубы страны)",
  19: "Зарплата после достижения числа матчей за сборную",
  20: "Процент зарплаты, оплачиваемый спонсором",
  21: "Процент от продажи билетов игроку",
  22: "Продление контракта по опции клуба",
  23: "Отказ от компенсации клубу за тренерскую должность",
  25: "Продление на год после матчей лиги (повышение в последнем сезоне)",
  26: "Продление на год после матчей лиги (сохранение прописки в последнем сезоне)",
  27: "Отступные (клубы Лиги чемпионов УЕФА)",
  28: "Гарантированный контракт MLS",
  29: "Продление контракта после повышения в классе",
  30: "Отступные при травме",
  31: "Отступные (клубы в континентальном турнире)",
  32: "Бонус за выход на поле",
  33: "Бонус за гол",
  34: "Бонус за сухой матч",
  37: "Бонус за матч за сборную",
  38: "Бонус за нахождение в запасе",
  39: "Бонус за голевую передачу",
  40: "Бонус за достижение числа голевых передач за сезон",
  41: "Бонус за достижение суммы голов и передач за сезон",
  54: "Не отображается в игре (54)",
  55: "Действующие отступные при вылете",
  56: "Действующие отступные при невыходе в высший дивизион",
  58: "Не отображается в игре (58)",
  63: "Не отображается в игре (63)",
};

/** Reasons to be unhappy, by the codes the game keeps them as. */
const CONCERN_MOTIVES_RU: Partial<Record<number, string>> = {
  596: "Не включён в заявку на турнир",
  808: "Считает, что с партнёром обошлись несправедливо",
  926: "Не считает, что партнёр заслуживает желаемого игрового времени",
};

/** Players' traits (preferred moves), by their bit in the game's mask. */
const TRAIT_NAMES_RU: readonly string[] = [
  "Проходит с мячом по левому флангу",
  "Проходит с мячом по правому флангу",
  "Проходит с мячом через центр",
  "Врывается в штрафную соперника",
  "Смещается в коридоры",
  "Подключается к атаке при любой возможности",
  "Играет в короткий простой пас",
  "Часто пытается отдать обостряющий пас",
  "Бьёт издали",
  "Бьёт с силой",
  "Бьёт на точность",
  "Закручивает мяч",
  "Любит обводить вратаря",
  "Любит обыгрывать офсайдную ловушку",
  "Играет внешней стороной стопы",
  "Плотно опекает соперника",
  "Провоцирует соперников",
  "Спорит с судьями",
  "Играет спиной к воротам",
  "Опускается за мячом",
  "Играет в стенку",
  "Любит перебрасывать вратаря",
  "Задаёт темп",
  "Пытается бить через себя",
  "Ищет пас вместо удара",
  "Не отдаёт пасов на ход",
  "Останавливает игру",
  "Прокидывает мяч мимо соперника",
  "Перед дриблингом переводит мяч на правую ногу",
  "Перед дриблингом переводит мяч на левую ногу",
  "Передерживает мяч",
  "Поздно врывается в штрафную соперника",
  "Пытается выпутаться из сложных ситуаций",
  "Всегда остаётся в обороне",
  "Избегает игры слабой ногой",
  "Пытается выполнять финты",
  "Бьёт дальние штрафные",
  "Идёт в подкат",
  "Не идёт в подкат",
  "Смещается в центр",
  "Держится у бровки",
  "Заводит трибуны",
  "Бьёт с ходу",
  "Отдаёт дальние передачи",
  "Любит получать мяч в ноги",
  "Бьёт штрафные с силой",
  "Любит раз за разом обыгрывать соперника",
  "Любит переводить мяч на другой фланг",
  "Завершит карьеру на пике",
  "Будет играть как можно дольше",
  "Выполняет длинные прямые вбрасывания",
  "Часто проходит с мячом",
  "Редко проходит с мячом",
  "Развивает слабую ногу",
  "Статичный нападающий-таран",
  "Начинает контратаки длинным вбрасыванием",
  "Воздерживается от дальних ударов",
  "Смещается в центр с левого фланга",
  "Смещается в центр с правого фланга",
  "Рано навешивает",
  "Выводит мяч из обороны",
  "Играет ногами",
];

export const ru: Strings = {
  attributes: {
    // Technical
    corners: "Угловые",
    crossing: "Навесы",
    dribbling: "Дриблинг",
    finishing: "Завершение",
    first_touch: "Первое касание",
    free_kicks: "Штрафные",
    heading: "Игра головой",
    long_shots: "Дальние удары",
    long_throws: "Длинные вбрасывания",
    marking: "Опека",
    passing: "Пас",
    penalty_taking: "Пенальти",
    tackling: "Отбор",
    technique: "Техника",
    // Mental
    aggression: "Агрессивность",
    anticipation: "Предвидение",
    bravery: "Смелость",
    composure: "Хладнокровие",
    concentration: "Концентрация",
    decisions: "Решения",
    determination: "Целеустремлённость",
    flair: "Импровизация",
    leadership: "Лидерство",
    off_the_ball: "Игра без мяча",
    positioning: "Выбор позиции",
    teamwork: "Командная игра",
    vision: "Видение поля",
    work_rate: "Работоспособность",
    // Physical
    acceleration: "Ускорение",
    agility: "Ловкость",
    balance: "Равновесие",
    jumping_reach: "Прыгучесть",
    natural_fitness: "Природная форма",
    pace: "Скорость",
    stamina: "Выносливость",
    strength: "Сила",
    // Goalkeeping
    aerial_reach: "Игра на выходах",
    command_of_area: "Контроль штрафной",
    communication: "Коммуникация",
    eccentricity: "Эксцентричность",
    handling: "Игра руками",
    kicking: "Игра ногами",
    one_on_ones: "Один на один",
    punching: "Отбивание кулаками (склонность)",
    reflexes: "Реакция",
    rushing_out: "Выходы из ворот (склонность)",
    throwing: "Ввод мяча рукой",
    // Hidden
    consistency: "Стабильность",
    dirtiness: "Грубость",
    important_matches: "Важные матчи",
    injury_proneness: "Склонность к травмам",
    versatility: "Универсальность",
    // Feet
    left_foot: "Левая нога",
    right_foot: "Правая нога",
  },

  staffAttributes: {
    // Coaching
    attacking: "Атака",
    defending: "Оборона",
    fitness: "Физподготовка",
    goalkeeping: "Вратари",
    possession: "Владение",
    set_pieces: "Стандарты",
    tactical: "Тактика",
    technical: "Техника",
    working_with_youngsters: "Работа с молодёжью",
    // Mental
    authority: "Авторитет",
    determination: "Целеустремлённость",
    motivating: "Мотивация",
    people_management: "Работа с людьми",
    // Knowledge
    data_analysis: "Анализ данных",
    judging_ability: "Оценка уровня игроков",
    judging_potential: "Оценка потенциала игроков",
    judging_staff: "Оценка уровня персонала",
    negotiating: "Переговоры",
    tactical_knowledge: "Знание тактики",
    // Medical
    physiotherapy: "Физиотерапия",
    sports_science: "Спортивная наука",
  },

  personality: {
    adaptability: "Адаптивность",
    ambition: "Амбициозность",
    loyalty: "Лояльность",
    pressure: "Стрессоустойчивость",
    professionalism: "Профессионализм",
    sportsmanship: "Спортивное поведение",
    temperament: "Темперамент",
    controversy: "Скандальность",
  },

  /** The abbreviations of the positions, as in English (FM's own). */
  positions: {
    gk: "GK",
    sw: "SW",
    dl: "DL",
    dc: "DC",
    dr: "DR",
    dm: "DM",
    ml: "ML",
    mc: "MC",
    mr: "MR",
    aml: "AML",
    amc: "AMC",
    amr: "AMR",
    st: "ST",
    wbl: "WBL",
    wbr: "WBR",
  },

  clubFacilities: {
    training: "Тренировочная база",
    youth_facilities: "Молодёжная база",
    youth_coaching: "Подготовка молодёжи",
    youth_recruitment: "Набор молодёжи",
    corporate: "Корпоративные",
  },

  supporterTraits: {
    loyalty: "Лояльность",
    passion: "Страсть",
    patience: "Терпение",
    affluence: "Достаток",
    temperament: "Темперамент",
    expectations: "Ожидания",
  },

  supporterMix: {
    hardcore: "Ультрас",
    core: "Основные",
    family: "Семейные",
    fair_weather: "Болельщики успеха",
    corporate: "Корпоративные",
    casual: "Случайные",
  },

  jobs: {
    1: "Игрок",
    2: "Тренер",
    4: "Председатель",
    6: "Директор",
    10: "Спортивный директор",
    12: "Физиотерапевт",
    14: "Скаут",
    16: "Менеджер",
    20: "Ассистент тренера",
    22: "Тренер по стандартам",
    26: "Тренер по физподготовке",
    34: "Тренер вратарей",
    38: "Главный врач",
    40: "Руководитель спортивной науки",
    44: "Главный скаут",
    46: "Врач",
    48: "Специалист по спортивной науке",
    50: "Главный физиотерапевт",
    58: "Аналитик по трансферам",
    60: "Аналитик игры",
    62: "Главный аналитик игры",
    64: "Руководитель академии",
    66: "Владелец",
    70: "Президент",
    86: "Менеджер по арендам",
    88: "Технический директор",
  },

  fields: {
    current_ability: "Текущий уровень",
    potential_ability: "Потенциал",
    height: "Рост (см)",
    date_of_birth: "Дата рождения",
    asking_price: "Запрашиваемая цена",
    nation: "Гражданство",
    city_of_birth: "Город рождения",
    "reputation.home": "Репутация в стране",
    "reputation.current": "Текущая репутация",
    "reputation.world": "Мировая репутация",
    "international.caps": "Матчи за сборную",
    "international.goals": "Голы за сборную",
    "international.u21_caps": "Матчи за U21",
    "international.u21_goals": "Голы за U21",
    condition: "Энергия",
    match_sharpness: "Игровая форма",
    jadedness: "Усталость",
    morale: "Мораль",
    "contract.wage": "Зарплата в неделю",
    "contract.loyalty_bonus": "Бонус за лояльность в неделю",
    "contract.happiness": "Удовлетворённость",
    "contract.playing_time_happiness": "Удовлетворённость игровым временем",
    "contract.unhappiness": "Причины недовольства",
    "contract.expires": "Окончание контракта",
    "contract.squad_number": "Номер",
    "contract.squad_status": "Статус в команде",
    "contract.transfer_listed": "Выставлен на трансфер",
    "contract.loan_listed": "Выставлен на аренду",
    "loan.expires": "Окончание аренды",
    "loan.option_fee": "Опция выкупа",
    "contract.job": "Должность",
    "tie.nationality": "Второе гражданство",
    "tie.trainedInNation": "Подготовлен в стране",
    "tie.trainedAtClub": "Подготовлен в клубе",
    "tie.workPermit": "Не нужно разрешение на работу в",
    club: "Клуб",
    injuries: "Травмы",
    cohesion: "Сыгранность",
    tactics: "Знание тактики",
    bans: "Дисквалификации",
    retirement: "Завершение карьеры",
    clause: "Пункт контракта",
    "clause.amount": "Сумма пункта",
    "clause.condition": "Условие пункта",
    captain: "Капитан",
    vice_captain: "Вице-капитан",
    reputation: "Репутация",
    "facilities.training": "Тренировочная база",
    "facilities.youth_facilities": "Молодёжная база",
    "facilities.youth_coaching": "Подготовка молодёжи",
    "facilities.youth_recruitment": "Набор молодёжи",
    "facilities.corporate": "Корпоративные объекты",
    "finance.balance": "Баланс",
    "finance.transfer_budget": "Трансферный бюджет",
    "finance.wage_budget": "Зарплатный бюджет",
    "finance.total_wage_budget": "Общий зарплатный бюджет",
    "stadium.capacity": "Вместимость стадиона",
    "stadium.name": "Название стадиона",
    "name.first": "Имя",
    "name.last": "Фамилия",
    "name.common": "Общепринятое имя",
    "name.full": "Полное имя",
    "stadium.seating": "Сидячих мест",
    "stadium.used": "Используемая вместимость",
    "stadium.expansion": "Вместимость после расширения",
  },

  profile: {
    close: "Закрыть профиль",
    /** The button at the left of a profile shown as a page of its own: it goes back to the list that named him. */
    back: "Назад",
    loading: "Загрузка профиля…",
    resize: "Изменить ширину панели профиля",
    resizeHint: "Перетащите, чтобы сделать панель шире или уже; двойной щелчок — сбросить",
    none: "—",

    // Header
    freeAgent: "Свободный агент",
    born: "Родился",
    height: (cm) => `${cm} см`,
    heightUnit: "см",
    uid: "UID",
    currentAbility: "Текущий уровень",
    currentAbilityShort: "ТУ",
    potentialAbility: "Потенциал",
    potentialAbilityShort: "ПОТ",
    potentialRange: "Потенциал задан диапазоном",

    // Attributes
    technical: "Технические",
    goalkeeping: "Вратарские",
    mental: "Ментальные",
    physical: "Физические",
    hidden: "Скрытые",
    feet: "Ноги",
    personality: "Характер",
    /** The heading of the ability radar: the six attributes of the position he plays. */
    radar: "Радар способностей",
    raw: (raw, scale = 100) => `исходное ${raw} / ${scale}`,
    lowerIsBetter: "чем меньше, тем лучше",
    age: (age) => `возраст ${age}`,

    // Positions
    positions: "Позиции",
    positionsSummary: (best) => `Владение позициями: ${best}`,
    positionRatings: "Владение позициями",
    positionTiers: {
      natural: "Родная",
      accomplished: "Опытный",
      competent: "Компетентный",
      unconvincing: "Неуверенный",
      ineffective: "Неэффективный",
    },
    positionTooltip: (position, rating, tier) => `${position} · ${rating} · ${tier}`,

    // Contract
    contract: "Контракт",
    wage: "Зарплата в неделю",
    wageNote: (converted) =>
      converted
        ? "игра хранит фунты; показано по курсу самой FM"
        : "игра хранит фунты; другую валюту можно выбрать в настройках",
    signed: "Подписан",
    expires: "Истекает",
    joined: "В клубе с",
    squadStatus: "Статус в команде",
    squadStatusName: (status) => SQUAD_STATUSES[status] ?? `Статус ${status}`,
    contractType: "Тип контракта",
    contractTypeName: (code) => CONTRACT_TYPES[code] ?? `Тип ${code}`,
    squadNumber: "Номер",
    transferListed: "Выставлен на трансфер",
    loanListed: "Выставлен на аренду",

    // Career
    career: "Карьера",
    internationalCaps: "Матчи за сборную",
    internationalGoals: "Голы за сборную",
    u21Caps: "Матчи за U21",
    u21Goals: "Голы за U21",
    askingPrice: "Запрашиваемая цена",
    notSet: "Не задано",
    reputation: "Репутация",
    reputationHome: "В стране",
    reputationCurrent: "Текущая",
    reputationWorld: "Мировая",
    retirement: "Завершение карьеры",
    retires: "Планирует завершить карьеру",
    noRetirement: "Игра не планирует завершение его карьеры",
    keepPlaying: "Не дать завершить карьеру",
    keepingPlaying: "Отменяем…",
    keepPlayingTitle:
      "Убрать завершение карьеры из планов игры и дать ему черту «Будет играть как можно дольше» вместо «Завершит карьеру на пике»; можно отменить в «Изменениях»",

    // Medical
    morale: (value) => `${value} / 20`,
    traits: "Черты",
    noTraits: "Нет черт",
    traitName: (bit) => TRAIT_NAMES_RU[bit] ?? `Черта ${bit}`,
    unhappiness: "Недовольство",
    noUnhappiness: "Ничто его не огорчает",
    removeUnhappiness: "Убрать всё",
    removingUnhappiness: "Убираем…",
    removeUnhappinessTitle: "Убрать все причины недовольства из его списка, как «Remove all» в FMRTE; можно отменить в «Изменениях»",
    removeUnhappinessFollows:
      "Причины недовольства им у его партнёров по команде исчезнут сами после продвижения игры: нажмите «Продолжить» в игре",
    concernSince: (date) => `с ${date}`,
    concernAbout: (name) => `партнёр: ${name}`,
    concernKind: (kind) => (kind === 1 ? "Обеспокоен" : kind === 2 ? "Внутреннее" : `Тип ${kind}`),
    concernMotive: (motive) => CONCERN_MOTIVES_RU[motive] ?? `Причина ${motive}`,
    clauses: "Бонусы и пункты",
    noClauses: "Нет бонусов и пунктов",
    loyaltyBonus: "Бонус за лояльность",
    happiness: "Удовлетворённость",
    playingTimeHappiness: "Удовлетворённость игровым временем",
    moodTitle: "Как в FMRTE, от -100 до 100; игра показывает это словами",
    clauseName: (kind) => CLAUSE_NAMES_RU[kind] ?? `Пункт ${kind}`,
    loan: "Аренда",
    loanAt: "В аренде в",
    loanParent: "Принадлежит",
    loanFrom: "С",
    loanUntil: "До",
    loanNumber: "Номер там",
    recall: "Вернуть из аренды",
    recallTitle: "Вернуть его в свой клуб: аренда заканчивается сегодня. Перед изменениями будет запрос",
    recallAgain: "Вернуть снова",
    makePermanent: "Выкупить",
    makePermanentTitle: "Оставить его в клубе, где он в аренде, с контрактом с этим клубом. Перед изменениями будет запрос",
    recalledWaiting: "Возвращён · ожидает возвращения",
    endsTodayWaiting: "Заканчивается сегодня · ожидает возвращения",
    pendingTitle: (parent) =>
      `Сегодня последний день аренды: продвиньтесь в игре на один день, и он вернётся в ${parent}.`,
    endPassed: (date) =>
      `Аренда должна была закончиться ${date}, но игра его не вернула. Верните его снова, затем продвиньтесь на один день.`,
    loanCanRecall: "Можно отозвать",
    loanCanRecallTitle: "Может ли его клуб отозвать его в игре. «Вернуть из аренды» здесь работает в любом случае",
    loanCanTerminate: "Можно досрочно прекратить",
    loanCupMatches: "Играет в кубковых матчах",
    loanAgainstClub: "Играет против своего клуба",
    loanOptionFee: "Опция выкупа",
    loanOptionFeeTitle: "Сумма, за которую арендующий клуб может выкупить его насовсем",
    loanMonthlyFee: "Ежемесячная плата",
    loanMonthlyFeeTitle: "Сколько арендующий клуб платит его клубу за каждый месяц, когда он играет",
    loanUnusedFee: "Ежемесячная плата, если не играет",
    loanUnusedFeeTitle: "Сколько арендующий клуб платит его клубу за каждый месяц, когда он не используется",
    clauseCondition: (kind, value) => {
      switch (kind) {
        case 10:
          return counted(value, "гол", "гола", "голов");
        case 40:
          return counted(value, "голевая передача", "голевые передачи", "голевых передач");
        case 41:
          return `${format(value)} голов и передач`;
        case 19:
          return counted(value, "матч за сборную", "матча за сборную", "матчей за сборную");
        case 11:
        case 13:
        case 25:
        case 26:
          return counted(value, "матч лиги", "матча лиги", "матчей лиги");
        case 22:
        case 29:
          return counted(value, "год", "года", "лет");
        case 3:
        case 4:
        case 5:
        case 8:
        case 9:
        case 14:
        case 15:
        case 20:
        case 21:
          return `${value}%`;
        default:
          return String(value);
      }
    },
    clauseExpires: (date) => `истекает ${date}`,
    clauseExpiresAfter: (days) => `истекает через ${counted(days, "день", "дня", "дней")} после подписания`,
    clauseProfitShare: (percent, amount) => `${percent} от прибыли сверх ${amount}`,
    clauseWage: (amount) => `${amount} в неделю`,
    moraleTitle: "Игра показывает мораль как общую удовлетворённость игрока: доволен при 10, слегка рад при 11, крайне рад при 15 и 20",
    jadednessTitle: "Насколько игрок вымотан игрой; отдых это снимает: -500 — полностью отдохнул, и чем выше, тем больше ему нужен отдых",
    noInjuries: "Нет травм",
    unknownInjury: "Неизвестная травма",
    injuryStarted: (date) => `С ${date}`,
    injuryBack: (dates) => `Ожидается возвращение ${dates}`,
    heal: "Вылечить",
    healTitle: "Вылечить все травмы этого игрока в игре",
    noBans: "Нет дисквалификаций",
    banMatches: (matches) => counted(matches, "матч", "матча", "матчей"),
    banStarted: (date) => `С ${date}`,
    liftBans: "Снять",
    liftBansTitle: "Снять все дисквалификации этого игрока в игре",

    // Above the attributes
    maxAttributes: "Максимум атрибутов",
    maxAttributesTitle: "Поднять все атрибуты этого игрока до максимума: 20, и 1 для склонности к травмам и грубости",
    maxAttributesDone: (count) =>
      count === 0 ? "Все атрибуты уже на максимуме" : `Записано: ${changes(count)}`,
    maxAttributesUndone: (count) => (count === 0 ? "Нечего отменять" : `Отменено: ${changes(count)}`),
    undoMax: "Отменить",
    undoMaxTitle: "Записать его прежние атрибуты обратно в игру",
    freezeAttributes: "Заморозить атрибуты",
    freezeAttributesNote:
      "Пока приложение открыто и подключено, его атрибуты не ухудшаются: то, что отнимает игра, возвращается, а " +
      "улучшения сохраняются. Приложение запоминает это для данного сохранения и снова замораживает при подключении к нему.",
    maxStaffAttributesTitle: "Поднять все атрибуты этого сотрудника до максимума: 20",
    undoMaxStaffTitle: "Записать прежние атрибуты обратно в игру",
    freezeStaffAttributesNote:
      "Пока приложение открыто и подключено, атрибуты сотрудника не ухудшаются: то, что отнимает игра, возвращается, а " +
      "улучшения сохраняются. Приложение запоминает это для данного сохранения и снова замораживает при подключении к нему.",
    freezeFitness: "Заморозить энергию и форму",
    freezeFitnessNote:
      "Пока приложение открыто и подключено, его энергия и игровая форма не снижаются: то, что отнимает игра, " +
      "возвращается, а прирост сохраняется, так что на 100% он там и остаётся. Приложение запоминает это для данного сохранения.",
    freezePositions: "Заморозить",
    freezePositionsInfo: "Что делает заморозка позиций?",
    freezePositionsNote:
      "Пока приложение открыто и подключено, владение позициями остаётся как есть: он не осваивает новых позиций, " +
      "а его оценки не растут и не падают. Приложение запоминает это для данного сохранения.",

    // Staff
    you: "Вы",
    youTitle: "Менеджер, которым вы управляете в этом сохранении",
    id: "ID",
    job: "Должность",
    changeJob: "Сменить должность",
    changeJobTitle: "Дать этому сотруднику другую должность в его клубе в игре",
    newJob: "Новая должность",
    applyJob: "Применить",
    cancelJob: "Отмена",
    unemployed: "Безработный",
    coaching: "Тренерские",
    knowledge: "Знания",
    medical: "Медицина",
    playerCoach: (job) => `${job} (играющий тренер)`,
    unknownJob: (code) => `Должность ${code}`,
  },

  playerList: {
    nav: "Игроки",
    count: (total) => playerCount(total),
    search: "Поиск игроков по имени или UID",
    summary: (total, shown, sorted) => {
      const count = playerCount(total);
      if (total <= shown) {
        return count;
      }
      return sorted === null
        ? `${count} · показаны первые ${shown} по текущему уровню`
        : `${count} · показаны первые ${shown} по полю «${sorted.by}», ${sorted.ascending ? "по возрастанию" : "по убыванию"}`;
    },
    empty: (query, filtered) => {
      if (query === "") {
        return filtered ? "Нет игроков, подходящих под эти фильтры." : "Игроки не найдены.";
      }
      return filtered ? `Нет игроков по запросу «${query}» с этими фильтрами.` : `Нет игроков по запросу «${query}».`;
    },
    columns: {
      name: "Имя",
      age: "Возраст",
      positions: "Позиции",
      nation: "Страна",
      club: "Клуб",
      contractExpires: "Контракт",
      born: "Дата рождения",
      currentAbility: "ТУ",
      potentialAbility: "ПОТ",
      uid: "UID",
    },
    sortBy: (by) => `Сортировать: ${by}`,
    sortNames: {
      currentAbility: "текущий уровень",
      potentialAbility: "потенциал",
      age: "возраст",
      name: "имя",
      nation: "страна",
      club: "клуб",
      contractExpires: "окончание контракта",
    },
    filters: {
      toggle: "Фильтры",
      toggleActive: (count) => `Фильтры, активно: ${count}`,
      clear: "Сбросить",
      any: "Любая",
      position: "Позиция",
      gender: "Пол",
      men: "Мужчины",
      women: "Женщины",
      age: "Возраст",
      minAge: "Минимальный возраст",
      maxAge: "Максимальный возраст",
      minPlaceholder: "От",
      maxPlaceholder: "До",
      minCurrentAbility: "Мин. ТУ",
      minCurrentAbilityTitle: "Минимальный текущий уровень",
      minPotentialAbility: "Мин. ПОТ",
      minPotentialAbilityTitle: "Минимальный потенциал",
      abilityPlaceholder: "1–200",
      nation: "Страна",
      club: "Клуб",
      freeAgentsOnly: "Только свободные агенты",
      contractEndsBy: "Контракт истекает до",
      transferListedOnly: "Только выставленные на трансфер",
      loanListedOnly: "Только выставленные на аренду",
      attributes: {
        heading: "Атрибуты",
        attribute: "Атрибут",
        pick: "Выберите атрибут",
        min: (name) => (name ? `${name}: не меньше` : "Не меньше"),
        max: (name) => (name ? `${name}: не больше` : "Не больше"),
        add: "Добавить атрибут",
        remove: (name) => (name ? `Убрать: ${name}` : "Убрать эту строку"),
      },
      saved: {
        save: "Сохранить",
        saveTitle: "Сохранить текущие фильтры и сортировку под именем",
        name: "Название сохранённого фильтра",
        namePlaceholder: "Название фильтра",
        ok: "ОК",
        cancel: "Отмена",
        select: "Сохранённые фильтры",
        delete: "Удалить",
        deleteTitle: (name) => `Удалить сохранённый фильтр: ${name}`,
        replaceQuestion: (name) => `Сохранённый фильтр «${name}» уже существует. Заменить его?`,
        replace: "Заменить",
        full: (max) =>
          `Можно сохранить не более ${max} фильтров. Сначала удалите один или используйте название существующего, чтобы заменить его.`,
      },
    },
    /** Hover text of a player's name, which opens his profile as a dialog over the list. */
    openProfile: "Открыть профиль игрока",
  },

  staffList: {
    nav: "Персонал",
    count: (total) => counted(total, "сотрудник", "сотрудника", "сотрудников"),
    search: "Поиск персонала по имени или ID",
    summary: (total, shown, sorted) => {
      const count = counted(total, "сотрудник", "сотрудника", "сотрудников");
      if (total <= shown) {
        return count;
      }
      return sorted === null
        ? `${count} · показаны первые ${shown} по текущему уровню`
        : `${count} · показаны первые ${shown} по полю «${sorted.by}», ${sorted.ascending ? "по возрастанию" : "по убыванию"}`;
    },
    empty: (query, filtered) => {
      if (query === "") {
        return filtered ? "Нет сотрудников, подходящих под эти фильтры." : "Сотрудники не найдены.";
      }
      return filtered
        ? `Нет сотрудников по запросу «${query}» с этими фильтрами.`
        : `Нет сотрудников по запросу «${query}».`;
    },
    columns: {
      name: "Имя",
      age: "Возраст",
      job: "Должность",
      club: "Клуб",
      nation: "Страна",
      born: "Дата рождения",
      currentAbility: "ТУ",
      potentialAbility: "ПОТ",
      id: "ID",
    },
    sortBy: (by) => `Сортировать: ${by}`,
    sortNames: {
      currentAbility: "текущий уровень",
      potentialAbility: "потенциал",
      age: "возраст",
      name: "имя",
      nation: "страна",
      club: "клуб",
    },
    filters: {
      job: "Должность",
      anyJob: "Любая",
      unemployedOnly: "Только безработные",
    },
  },

  clubProfile: {
    womensClub: "Женский клуб",
    founded: (year) => `Основан в ${year}`,
    reputationShort: "РЕП",
    reputationTitle: "Репутация",

    tabsLabel: "Разделы клуба",
    tabs: { overview: "Обзор", squad: "Состав", stadium: "Стадион" },
    squadLocked: "Завершите редактирование, чтобы открыть состав",

    facilities: "Инфраструктура",

    supporters: "Болельщики",
    supporterMix: "Состав болельщиков",
    percent: (value) => `${percents.format(value)}%`,
    mixTooltip: (kind, percent) => `${kind} · ${percent}`,

    finances: "Финансы",
    balance: "Баланс",
    transferBudget: "Трансферный бюджет",
    wageBudget: "Зарплатный бюджет (расходы)",
    totalWageBudget: "Общий зарплатный бюджет",
    ticketPrice: "Средняя цена билета",
    perWeek: "в неделю",
    noFinances: "FM хранит финансы только для клубов из играемых лиг.",
    freeze: "Заморозить деньги",
    freezeNote:
      "Пока приложение открыто и подключено, баланс не уменьшается: то, что отнимает игра, возвращается, а доходы " +
      "сохраняются. Приложение запоминает это для данного сохранения и снова замораживает при подключении к нему.",

    stadium: "Стадион",
    capacity: "Вместимость",
    seating: "Сидячих мест",
    used: "Используется",
    usedAll: "Вся",
    usedTitle: "Часть вместимости, которую допускает игра, когда она её ограничивает (например, пока места закрыты); 0 — вся",
    expansion: "Можно расширить до",
    noStadium: "Не удалось прочитать стадион этого клуба.",
    stadiumName: "Название",
    rename: "Переименовать",
    renameTitle: "Дать стадиону другое название; оно записывается сразу, и его можно отменить в «Изменениях»",
    renameInfoLabel: "Как работает переименование?",
    renameInfo:
      "Игра не хранит названия стадионов в сохранениях: она берёт их из своей базы при каждой загрузке сохранения. " +
      "Поэтому FMLibreEditor запоминает новое название для этого сохранения и возвращает его в течение нескольких секунд " +
      "при каждой загрузке, пока приложение открыто и подключено. Если игра загрузит сохранение, когда приложение " +
      "закрыто, она покажет своё название, пока приложение снова не подключится. Чтобы вернуть старое название, " +
      "отмените переименование в «Изменениях» или переименуйте стадион обратно.",
    saveName: "Сохранить",
    renaming: "Сохранение…",
    cancelRename: "Отмена",
    nameLength: (bytes, min, max) =>
      min <= 1
        ? `${bytes} из не более ${max} символов (буква не латиницы или с диакритикой считается за две)`
        : `${bytes} символов: от ${min} до ${max}, чтобы поместиться там, где игра хранит название (буква не латиницы или с диакритикой считается за две)`,
    nameShared: (holders) =>
      `Это название используют ${holders} объектов в игре, поэтому его нельзя изменить только для стадиона`,

    info: "О клубе",
    seasonTickets: "Абонементы",
    socialMedia: "Подписчики в соцсетях",
  },

  clubList: {
    nav: "Клубы",
    count: (total) => counted(total, "клуб", "клуба", "клубов"),
    search: "Поиск клубов по названию или UID",
    summary: (total, shown) =>
      total > shown
        ? `${counted(total, "клуб", "клуба", "клубов")} · показаны первые ${shown} по репутации`
        : counted(total, "клуб", "клуба", "клубов"),
    empty: (query, filtered) => {
      if (query === "") {
        return filtered ? "Нет клубов, подходящих под этот фильтр." : "Клубы не найдены.";
      }
      return filtered ? `Нет клубов по запросу «${query}» с этим фильтром.` : `Нет клубов по запросу «${query}».`;
    },
    women: "Жен.",
    columns: {
      name: "Название",
      reputation: "Репутация",
      founded: "Основан",
      uid: "UID",
    },
    filters: {
      kind: "Какие клубы показывать",
      all: "Все клубы",
      men: "Мужские клубы",
      women: "Женские клубы",
    },
  },

  app: {
    stage: "бета",
    settingsLabel: "Настройки",
    languageLabel: "Язык",
    currencyLabel: "Валюта",
    devLabel: "Разработка",
    sampleDataLabel: "Пример данных",
    sampleDataHint: "Показывать вымышленных игроков, персонал и клубы вместо игры",
    sampleTag: "пример данных · не игра",

    noteEditable: "Изменения попадают в игру только после применения. Сначала сделайте резервную копию сохранения.",
    noteReadOnly: "Только чтение: Windows не разрешила FMLibreEditor записывать в игру.",
    noteUnknownBuild: "Только чтение: эта версия игры незнакома FMLibreEditor.",
    noteNotConnected: "В игре ничего не меняется, пока вы не отредактируете и не примените.",

    notConnected: "Не подключено",
    previewTag: "предпросмотр в браузере · пример данных",
    noDate: "Нет игровой даты",
    noDateTitle:
      "FMLibreEditor не смог прочитать игровую дату в этой версии игры, поэтому возраст не показывается, а фильтры " +
      "по возрасту никого не находят. Проверьте обновления.",
    reload: "Перезагрузить данные",
    refresh: "Обновить",
    detecting: "Поиск Football Manager…",
    connecting: "Чтение игроков, персонала и клубов…",
    reloading: "Повторное чтение игроков, персонала и клубов…",

    saveChanged: {
      title: "Сохранение в игре изменилось",
      text:
        "С тех пор как FMLibreEditor прочитал игру, она загрузила сохранение или вернулась в главное меню. Пока вы не " +
        "перезагрузите данные, редактор ничего не меняет в игре и ничего не держит замороженным: показанное может " +
        "относиться к другому сохранению.",
    },

    refrozen: {
      title: "Снова заморожено с прошлого раза",
      waitingTitle: "Замороженное пока ожидает",
      players: (names) => `Атрибуты: ${names}`,
      staff: (names) => `Атрибуты персонала: ${names}`,
      clubs: (names) => `Деньги: ${names}`,
      fitness: (names) => `Энергия и форма: ${names}`,
      positions: (names) => `Позиции: ${names}`,
      stadiums: (names) => `Названия стадионов: ${names}`,
      more: (count) => `и ещё ${format(count)}`,
      waiting: (count) =>
        `Запомнено, но сейчас не заморожено: ${format(count)}. FMLibreEditor пока не может записывать в эту версию игры.`,
      dismiss: "Скрыть",
    },

    freezeInfo: {
      label: "Как работает заморозка?",
      note:
        "Заморозка не меняет игру навсегда: каждые 2 секунды FMLibreEditor возвращает то, что отняла игра. Поэтому она " +
        "работает, только пока приложение открыто и подключено; закройте его — и игра снова будет менять значения. " +
        "Приложение запоминает, что заморожено в этом сохранении, и снова замораживает при следующем подключении к нему.",
    },

    connect: {
      title: "Подключение к Football Manager 27",
      intro: "FMLibreEditor читает память игры во время её работы. Запустите игру, загрузите сохранение и подключитесь.",
      notRunning: "Football Manager 27 не запущен.",
      openFailed: (error) => `Не удалось открыть игру: ${error}`,
      game: "Игра",
      gameData: "Данные игры",
      loaded: "Загружены",
      stillLoading: "Ещё загружаются; дождитесь главного меню",
      process: "Процесс",
      pid: (pid) => `pid ${pid}`,
      several: "Запущено несколько копий игры; используется первая.",
      button: "Подключиться и прочитать игроков, персонал и клубы",

      bridge: {
        title: "Мост (macOS)",
        intro:
          "macOS не пускает приложения в память других приложений, поэтому FM27 должна передать свою память сама. Она " +
          "делает это, загрузив мост FMLibreEditor: небольшую библиотеку, которая ничего не перехватывает и не меняет " +
          "в игре и отдаёт её память только этому приложению. Параметр запуска в Steam заставляет FM27 загрузить его.",
        library: "Мост",
        installed: "Установлен",
        missing: "Не установлен",
        launchOption: "Параметр запуска",
        set: "Задан в Steam",
        notSet: "Не задан",
        ready: "Готово. Запустите FM27 из Steam (если запущена — закройте и запустите снова), загрузите сохранение и подключитесь.",
        steamRunning:
          "Steam запущен и, пока работает, держит параметры запуска у себя. Закройте Steam, чтобы параметр запуска " +
          "был задан автоматически, или введите его в Steam сами.",
        setUp: "Настроить мост",
        remove: "Удалить мост",
        manual: "Или в Steam: правый щелчок по Football Manager 27 › Свойства › Общие › Параметры запуска, и введите:",
        copy: "Копировать",
        copied: "Скопировано",
      },
    },

    /** The window's own buttons, where Windows draws no title bar for the app to sit under (`WindowButtons`). */
    titlebar: {
      minimize: "Свернуть",
      maximize: "Развернуть",
      restore: "Восстановить",
      close: "Закрыть",
    },
  },

  graphics: {
    reading: "Чтение графических паков…",
    summary: ({ clubLogos, flags, faces }) =>
      `Графика: ${counted(clubLogos, "логотип", "логотипа", "логотипов")} клубов · ` +
      `${counted(flags, "флаг", "флага", "флагов")} · ${counted(faces, "лицо", "лица", "лиц")}`,
    none: "Графические паки не найдены",
    noneHint: "Паки логотипов и лиц кладутся в папку graphics FM27.",
  },

  compatibility: {
    unknownBuild: (game) => `FMLibreEditor ещё не проверялся с ${game}`,
    unknownBuildText:
      "Вероятно, игра обновилась. FMLibreEditor нашёл данные игры и проверил их, но не записывает в непроверенную " +
      "версию, пока вы не разрешите. Новая версия FMLibreEditor обычно выходит в течение нескольких дней.",
    allowedText: "Редактирование включено на этот сеанс, насколько позволяют проверки. Держите резервную копию сохранения.",
    failedTitle: "Часть данных игры не прошла проверку",
    reloadHint: "Если сохранение ещё загружалось, «Перезагрузить данные» проверит снова.",
    noDate: "Игровая дата не прошла проверку, поэтому возраст не показывается.",
    failed: (names) => `Только чтение: ${names}.`,
    failedCheck: (name, fit, sampled) => `${name} (подходят ${format(fit)} из ${format(sampled)})`,
    join: (names) =>
      names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`,
    allow: "Всё равно редактировать",
    allowTitle: "Включить редактирование, пока FMLibreEditor не закроется или не подключится заново. Сначала сделайте резервную копию сохранения.",
  },

  diagnostics: {
    copy: "Копировать диагностику",
    copyTitle: "Скопировать то, что FMLibreEditor нашёл в игре, чтобы вставить в отчёт об ошибке. Без имён и путей.",
    copied: "Скопировано",
    failed: (reason) => `Не удалось скопировать диагностику: ${reason}`,
  },

  checks: {
    gameDate: "игровая дата",
    players: "данные игроков",
    positions: "позиции",
    attributes: "атрибуты",
    personality: "характер",
    liveValues: "энергия, игровая форма, усталость и мораль",
    contracts: "контракты",
    teams: "команды",
    staff: "персонал",
    clubs: "клубы",
    cohesion: "сыгранность с клубами",
    tactics: "знание тактики",
  },

  update: {
    available: (version) => `Доступна версия FMLibreEditor ${version}`,
    youHave: (version) => `У вас ${version}.`,
    download: "Скачать",
    install: "Обновить",
    installTitle: "Скачать и установить новую версию; FMLibreEditor закроется и откроется уже с ней",
    preparing: "Подготовка…",
    downloading: (percent) => (percent === null ? "Загрузка…" : `Загрузка… ${percent}%`),
    installing: "Установка: FMLibreEditor закроется и откроется с новой версией.",
    installFailed: (reason) => `Не удалось обновить: ${reason}. Скачайте её со страницы релиза.`,
    notInstallable: "Эту версию нельзя установить отсюда. Скачайте её со страницы релиза.",
    later: "Позже",
    check: "Проверить обновления",
    checking: "Проверка обновлений…",
    upToDate: "У вас последняя версия.",
    failed: "Не удалось проверить обновления.",
  },

  edit: {
    unknownNation: "Неизвестная страна",
    unknownCity: "Неизвестный город",
    edit: "Редактировать",
    editTitle: "Изменить значения этого профиля в игре",
    startFailed: (reason) => `Не удалось начать редактирование: ${reason}`,
    positionRating: (position) => `Позиция ${position}`,
    was: (value) => `было ${value}`,
    invalid: (min, max) => `Введите целое число от ${min} до ${max}`,
    invalidDate: (from, to) => `Введите дату с ${from} по ${to}`,
    invalidMoney: (from, to) => `Введите целую сумму от ${from} до ${to}`,
    invalidPercentage: (from, to) => `Введите целый процент от ${from} до ${to}`,
    percent: "%",
    yes: "Да",
    no: "Нет",
    none: "нет",

    footer: "Редактирование",
    changes: changeCount,
    invalidCount: (count) => `с ошибкой: ${count}`,
    review: "Просмотр",
    reviewList: "Изменения к применению",
    discard: "Отменить",
    apply: "Применить",
    applying: "Применение…",
    applyBlocked: "Сначала исправьте недопустимые значения",
    done: "Готово",
    confirmDiscard: (count) => `Отменить: ${changes(count)}?`,
    keepEditing: "Продолжить редактирование",

    applied: (count) => `Применено: ${changes(count)}`,
    nothingToChange: "Нечего менять: в игре уже эти значения.",
    refused: (label, reason) => `${label}: ${reason}`,
    rereadFailed: (reason) => `Не удалось прочитать значения повторно: ${reason}`,
    dismiss: "Скрыть",
  },

  changes: {
    nav: "Изменения",
    title: "Изменения за сеанс",
    hint: "Сначала новые. Изменение можно отменить, только пока в игре остаётся записанное им значение.",
    continueHint: "Игра показывает изменение после продвижения: нажмите «Продолжить» в игре.",
    swappedWith: (name) => `Обмен на ${name}`,
    released: (name) => `${name} отпущен`,
    fee: (amount) => `Сумма ${amount}`,
    optionRemoved: (amount) => `Опция выкупа (${amount}) убрана`,
    healed: (count) => `Вылечено: ${counted(count, "травма", "травмы", "травм")}`,
    lifted: (count) => `Снято: ${counted(count, "дисквалификация", "дисквалификации", "дисквалификаций")}`,
    keptPlaying: (date) => (date === null ? "Будет играть дальше" : `Завершение карьеры ${date} отменено`),
    count: (total, undone) => {
      const count = changeCount(total);
      return undone === 0 ? count : `${count} · отменено ${undone}`;
    },
    empty: "Изменений пока нет. Откройте игрока, сотрудника или клуб и нажмите «Редактировать» или используйте «Массовое редактирование» в списке.",
    columns: {
      time: "Время",
      name: "Имя",
      field: "Поле",
      change: "Изменение",
      status: "Статус",
    },
    kinds: { player: "Игрок", staff: "Персонал", club: "Клуб" },
    stored: (change) => `хранится ${change}`,
    undone: (time) => `Отменено в ${time}`,
    undo: "Отменить",
    undoTitle: (label) => `Записать прежнее значение поля «${label}» обратно в игру`,
    batch: "Массовое",
    batchCount: (total, remaining) =>
      remaining === 0 ? `${changeCount(total)} · все отменены` : `${changeCount(total)} · не отменено ${format(remaining)}`,
    showChanges: "Показать изменения",
    hideChanges: "Скрыть изменения",
    undoBatch: "Отменить массовое редактирование",
    undoBatchTitle: (remaining) =>
      `Записать прежние значения этого массового редактирования обратно в игру (ещё действует: ${format(remaining)})`,

    pages: "Страницы списка",
    batchPages: "Страницы изменений этого массового редактирования",
    previous: "Назад",
    next: "Вперёд",
    range: (first, last, total) => `${format(first)}–${format(last)} из ${format(total)}`,
  },

  export: {
    button: "Экспорт",
    buttonTitle: {
      player: "Записать показанных в списке игроков в файл CSV или JSON — для таблицы или скрипта",
      staff: "Записать показанный в списке персонал в файл CSV или JSON — для таблицы или скрипта",
      club: "Записать показанные в списке клубы в файл CSV или JSON — для таблицы или скрипта",
    },
    title: { player: "Экспорт игроков", staff: "Экспорт персонала", club: "Экспорт клубов" },
    scope: (entity, count) =>
      count === 0
        ? `Нет ${entityNouns[entity]}, подходящих под поиск и фильтры.`
        : `${entityCount(entity, count)}: всё, что выбрано поиском и фильтрами списка, в его порядке.`,
    formatLabel: "Формат",
    formats: {
      csv: "CSV, через запятую",
      csvSemicolon: "CSV, через точку с запятой",
      json: "JSON",
    },
    formatHints: {
      csv: "Для большинства таблиц и скриптов",
      csvSemicolon: "Для Excel, где десятичные дроби пишутся через запятую, как в русском",
      json: {
        player: "Для скриптов: позиции, атрибуты и характер — отдельными объектами",
        staff: "Для скриптов: атрибуты, характер и контракт — отдельными объектами",
        club: "Для скриптов: болельщики, инфраструктура, стадион и финансы — отдельными объектами",
      },
    },
    contents: {
      player:
        "Для каждого игрока: уровень и потенциал, позиции и владение ими, атрибуты по шкале 1–20 (включая скрытые), " +
        "характер, репутация, матчи за сборную и контракт с пунктами, а также игровая дата. Деньги в фунтах, как их " +
        "хранит игра. В игре ничего не меняется.",
      staff:
        "Для каждого сотрудника: должность и работодатель, уровень, атрибуты по шкале 1–20, характер, репутация и " +
        "контракт (зарплата и даты), а также игровая дата. Деньги в фунтах, как их хранит игра. В игре ничего не меняется.",
      club:
        "Для каждого клуба: репутация, год основания, абонементы, подписчики в соцсетях, состав и черты болельщиков, " +
        "инфраструктура, стадион и финансы: баланс, трансферный бюджет, недельные расходы на зарплаты и зарплатный " +
        "бюджет, цена билета, а также игровая дата. FM хранит финансы только для клубов из играемых лиг. Деньги в " +
        "фунтах, как их хранит игра. В игре ничего не меняется.",
    },
    export: "Экспортировать",
    exporting: "Экспорт…",
    done: (entity, count, file) => `Экспортировано: ${entityCount(entity, count)} в ${file}`,
    folder: (folder) => `в ${folder}`,
    skipped: (entity, count) =>
      `Пропущено: ${entityCount(entity, count)} — данные изменились в игре во время чтения.`,
    open: "Открыть",
    openTitle: "Открыть файл в приложении, которое система использует для него",
    show: "Показать в папке",
    showTitle: "Показать файл в его папке",
    close: "Закрыть",
  },

  massEdit: {
    button: "Массовое редактирование",
    buttonTitle: "Изменить значения у всех, кто показан в списке, с предварительным просмотром",
    title: {
      player: "Массовое редактирование игроков",
      staff: "Массовое редактирование персонала",
      club: "Массовое редактирование клубов",
    },

    scope: (entity, total) => `Сейчас в списке (поиск и фильтры): ${entityCount(entity, total)}`,
    scopeAll: (shown) => `Это все совпадения, а не только первые ${format(shown)} строк на экране.`,
    scopeNone: (entity) => `Нет ${entityNouns[entity]}, подходящих под поиск и фильтры, поэтому менять нечего.`,
    scopeTooMany: (entity, total, limit) =>
      `В списке ${entityCount(entity, total)} — больше, чем допускает одно массовое редактирование (${format(limit)}). ` +
      "Сначала сузьте поиск или фильтры.",
    loadingFields: "Чтение полей…",
    fieldsFailed: (reason) => `Не удалось прочитать поля: ${reason}`,

    groups: {
      ability: "Уровень",
      technical: "Технические атрибуты",
      mental: "Ментальные атрибуты",
      physical: "Физические атрибуты",
      goalkeeping: "Вратарские атрибуты",
      hidden: "Скрытые атрибуты",
      feet: "Ноги",
      coaching: "Тренерские атрибуты",
      knowledge: "Атрибуты знаний",
      medical: "Медицинские атрибуты",
      positions: "Позиции",
      personality: "Характер",
      reputation: "Репутация",
      international: "Сборная",
      contract: "Контракт",
      facilities: "Инфраструктура",
      finances: "Финансы",
      stadium: "Стадион",
      traits: "Черты",
      health: "Медицина",
      other: "Прочее",
    },
    fieldsLabel: "Поля для изменения",
    row: (position) => `Изменение ${position}`,
    field: "Поле",
    operation: "Операция",
    operations: { set: "Задать", add: "Прибавить", scale: "Масштаб в %" },
    values: { set: "Значение", add: "Величина", scale: "Процент" },
    addTitle: "Прибавляется к каждому значению в том виде, как оно показано; отрицательное число вычитает",
    addPointsTitle: "Процентные пункты, прибавляемые к каждому значению (70% плюс 10 — это 80%); отрицательное число вычитает",
    rangeHint: (min, max) => `${format(min)}–${format(max)}`,
    amountHint: (max) => `±${format(max)}`,
    ofCurrent: "% от текущего",
    percentTitle: "Процент от текущего значения: 100 — без изменений, 110 — на десятую больше, 50 — вдвое меньше",
    invalidAdd: (min, max) => `Введите целое число от ${format(min)} до ${format(max)}`,
    invalidPercent: (min, max) => `Введите целый процент от ${min} до ${max}`,
    dateSetOnly: "Дату можно только задать",
    addField: "Добавить поле",
    addFieldFull: (max) => `Массовое редактирование меняет не более ${max} полей`,
    remove: "Убрать это поле",
    removeLast: "Массовому редактированию нужно хотя бы одно поле",

    preview: "Предпросмотр",
    previewing: "Предпросмотр…",
    previewBlocked: "Заполните все поля допустимыми значениями для предпросмотра",
    summary: (entity, preview) =>
      [
        preview.changes === 0
          ? "Нет изменений"
          : `${changeCount(preview.changes)} для ${format(preview.targets - preview.unchanged)} из ` +
            entityGenitive(entity, preview.targets),
        preview.unchanged > 0 && `уже с этими значениями: ${format(preview.unchanged)}`,
        preview.skippedCount > 0 && valuesLeftAlone(preview.skippedCount),
      ]
        .filter(Boolean)
        .join(" · "),
    tableLabel: "Изменения, которые внесёт массовое редактирование",
    columns: { name: "Имя", field: "Поле", change: "Изменение", reason: "Причина" },
    more: (count) => `и ещё ${format(count)}`,
    skippedHeading: valuesLeftAlone,
    skippedLabel: "Значения, которые массовое редактирование не изменит",

    apply: "Применить",
    applying: "Применение…",
    applyTitle: (count) => `Записать в игру: ${changes(count)}`,
    applyFirst: "Сначала сделайте предпросмотр",
    applyNothing: "В предпросмотре нет изменений для записи",
    hint: "В игре ничего не меняется, пока вы не примените.",
    applied: (count) => (count === 0 ? "Изменения не записаны" : `Применено: ${changes(count)}`),
    failure: (name, label, reason) => `${name} · ${label}: ${reason}`,
    undo: "Отменить это массовое редактирование",
    undoing: "Отмена…",
    undoTitle: "Записать прежние значения этого массового редактирования обратно в игру",
    undone: (count) => (count === 0 ? "Нечего отменять" : `Отменено: ${changes(count)}`),
    undoFailure: (who, reason) => `${who}: ${reason}`,
    changeNumber: (id) => `Изменение ${id}`,
    close: "Закрыть",
  },

  comparison: {
    compare: "Сравнить",
    add: "Добавить в сравнение",
    remove: "Убрать из сравнения",
    full: (max) => `В сравнении не более ${max} игроков. Уберите одного, чтобы добавить этого.`,

    trayLabel: "Игроки для сравнения",
    removePlayer: (name) => `Убрать из сравнения: ${name}`,
    clear: "Очистить",
    open: (count) => `Сравнить (${count})`,

    title: "Сравнение",
    hint: "Лучшее значение в каждой строке выделено: наибольшее или наименьшее, где меньше — лучше.",
    tooFew: "Добавьте хотя бы двух игроков для сравнения.",
    loading: "Загрузка игроков…",
    tableLabel: "Значения сравниваемых игроков",
    highest: "наибольшее",
    lowest: "наименьшее",
    profile: "Профиль",
    close: "Закрыть",
  },

  move: {
    button: "Трансфер",
    buttonTitle: "Перевести этого игрока в другой клуб в игре, при желании — за плату",

    title: "Трансфер",
    from: "Откуда",
    to: "Куда",

    modeLabel: "Трансфер или обмен",
    modeMove: "Трансфер в клуб",
    modeSwap: "Обмен на игрока",

    searchLabel: "Поиск клуба для трансфера",
    resultsLabel: "Найденные клубы",
    searching: "Поиск клубов…",
    searchFailed: (reason) => `Не удалось найти клубы: ${reason}`,
    more: (count) => `и ещё ${format(count)}; уточните поиск`,
    change: "Выбрать другой клуб",

    feeHeading: "Сумма",
    fee: "Сумма трансфера",
    feeHint: "Оставьте пустым для бесплатного трансфера",
    feeInvalid: (max) => `Введите целую сумму от 0 до ${max}`,
    pays: (club, fee, balance, budget) =>
      `${club} платит ${fee}: баланс ${balance}${budget === null ? "" : `, трансферный бюджет ${budget}`}`,
    receives: (club, fee, balance) => `${club} получает ${fee}: баланс ${balance}`,
    noFinances: (club) => `У клуба ${club} нет финансов в игре: его деньги не меняются`,

    wageInvalid: "Введите целую сумму, 0 или больше",
    expiresInvalid: "Введите дату",

    chooseClub: "Выберите клуб, в который перевести игрока.",
    fixTerms: "Сначала исправьте сумму или условия контракта.",
    checking: "Проверка трансфера…",
    route: (from, to) => `${from} → ${to}`,
    doesHeading: "Что делает трансфер",
    does: [
      "Переходит в основную команду нового клуба",
      "Контракт датируется игровой датой; номер сбрасывается",
      "Снимается с трансферного и арендного списков",
      "Зарплата и окончание контракта меняются, только если вы зададите новые",
      "Сумма списывается с баланса и трансферного бюджета покупающего клуба и зачисляется на баланс продающего",
      "Капитанство в старом клубе остаётся свободным",
      "В истории трансферов игры это пока не отображается",
      "Отображается в «Изменениях», где одна отмена возвращает и трансфер, и сумму",
    ],

    noRoom: (club) => `В составе клуба ${club} нет места.`,
    noRoomInfoLabel: "Почему?",
    noRoomInfo:
      "Редактор расширяет заполненную заявку, где может, но эту расширить не может: чтобы освободить место, кто-то " +
      "должен уйти.",
    noRoomNeed: (player, club) => `Чтобы ${player} перешёл, кто-то должен покинуть ${club}.`,
    releaseChoice: "Отпустить:",
    releasePickLabel: "Игрок, которого отпустить",
    releaseOutcome: "→ станет свободным агентом",
    injuredTag: "травмирован",
    captainTag: "капитан",
    swapChoice: "Сделать обменом:",
    swapChoiceOutcome: (club) => `этот игрок перейдёт в ${club}`,
    moveAndRelease: (name) => `Трансфер и отпустить ${name}`,
    makeRoomDoes: [
      "Переходит в основную команду нового клуба на место отпущенного игрока",
      "Отпущенный игрок покидает все команды клуба, его контракт расторгается: свободный агент",
      "Контракт датируется игровой датой; номер сбрасывается",
      "Снимается с трансферного и арендного списков",
      "Зарплата и окончание контракта меняются, только если вы зададите новые",
      "Сумма списывается с баланса и трансферного бюджета покупающего клуба и зачисляется на баланс продающего",
      "Капитанство любого из них в покидаемом клубе остаётся свободным",
      "В истории трансферов игры это пока не отображается",
      "Отображается в «Изменениях» одним изменением, где одна отмена возвращает трансфер, отпуск игрока и сумму",
    ],

    swapTitle: "Обмен на игрока",
    swapWith: "Обмен на",
    playerSearchLabel: "Поиск игрока для обмена",
    playerSearch: "Поиск игроков этого клуба по имени",
    playersLabel: "Найденные игроки",
    playersSearching: "Поиск игроков…",
    playersSearchFailed: (reason) => `Не удалось найти игроков: ${reason}`,
    playersEmpty: (query) =>
      query === "" ? "В этом клубе нет игроков." : `Нет игроков этого клуба по запросу «${query}».`,
    changePlayer: "Выбрать другого игрока",

    swapContract: "Каждый игрок сохраняет свой контракт; зарплаты и сроки контрактов не меняются.",
    staffButtonTitle: "Перевести этого сотрудника в другой клуб в игре",
    staffChooseClub: "Выберите клуб, в который перевести этого сотрудника.",
    staffContract: "Сохраняет должность, зарплату и окончание контракта; контракт датируется игровой датой.",
    staffJob: "Должность",
    staffJobChoose: "Выберите должность…",
    staffJobKept: (job) => `${job} (сохраняет)`,
    staffNewJob: "Занимает новую должность, сохраняет зарплату и окончание контракта; контракт датируется игровой датой.",
    staffDoes: [
      "Переходит в новый клуб туда, где эта должность: в медицинский, тренерский или скаутский отдел, либо " +
        "спортивным директором или менеджером — если в клубе такого ещё нет",
      "Та же зарплата и окончание контракта; контракт датируется игровой датой",
      "Менеджер, покидающий команду, оставляет место свободным для клуба; правление остаётся за игрой",
      "Отображается в «Изменениях», где это можно отменить",
    ],
    staffSignButtonTitle: "Подписать этого сотрудника без клуба в клуб в игре",
    staffSignTitle: "Подписать сотрудника",
    staffSignChooseClub: "Выберите клуб, в который его подписать.",
    staffSignChooseJob: "Выберите должность, которую сотрудник займёт в клубе.",
    staffSignTerms:
      "Оставьте пустыми, чтобы взять зарплату сотрудника клуба с наиболее похожей должностью и контракт до конца " +
      "следующего сезона.",
    staffSignRoute: (to) => `Без клуба → ${to}`,
    staffSignContract: (wage, expires) => `Новый контракт: ${wage} в неделю до ${expires}`,
    staffSignDoes: [
      "Попадает в клуб туда, где эта должность: в отдел (расширяется, если заполнен), либо спортивным директором " +
        "или менеджером, если такого нет",
      "Новый контракт с игровой даты в одном из свободных слотов контрактов самой игры, как это делает игра",
      "По образцу контракта сотрудника клуба с той же должностью (иначе из того же отдела, иначе любого), " +
        "ближайшего по уровню",
      "Ваши зарплата и окончание контракта или зарплата из образца и конец следующего сезона; без пунктов и бонусов",
      "Отображается в «Изменениях», где одна отмена возвращает всё",
    ],
    swapChooseClub: "Выберите клуб игрока для обмена.",
    swapChoosePlayer: "Выберите игрока для обмена.",
    swapChecking: "Проверка обмена…",
    swapRoute: (player, from, to, other) => `${player}: ${from} → ${to}\n${other}: ${to} → ${from}`,
    swapDoesHeading: "Что делает обмен",
    swapDoes: [
      "Каждый переходит в основную команду клуба другого",
      "Контракты датируются игровой датой; номера сбрасываются",
      "Оба снимаются с трансферного и арендного списков",
      "Капитанство в старых клубах остаётся свободным",
      "Никаких сумм не платится; история карьеры не обновляется",
      "Отображается в «Изменениях» одним изменением, отмена которого возвращает оба перехода",
    ],

    signButtonTitle: "Подписать этого свободного агента в клуб в игре",
    signTitle: "Подписать свободного агента",
    signChooseClub: "Выберите клуб, в который подписать игрока.",
    signChecking: "Проверка подписания…",
    signTerms:
      "Оставьте пустыми, чтобы взять зарплату игрока клуба, ближайшего по уровню, и контракт до конца следующего сезона.",
    signRoute: (to) => `Свободный агент → ${to}`,
    signContract: (wage, expires, status) => `Новый контракт: ${wage} в неделю до ${expires}, ${status}`,
    signDoesHeading: "Что делает подписание",
    signDoes: [
      "Попадает в основную команду клуба; заполненная заявка расширяется",
      "Новый контракт с игровой даты в одном из свободных слотов контрактов самой игры, как это делает игра",
      "По образцу контракта игрока клуба, ближайшего по уровню: тот же тип контракта и статус в команде",
      "Ваши зарплата и окончание контракта или зарплата того игрока и конец следующего сезона",
      "Без номера, бонуса за лояльность, пунктов и бонусов",
      "В истории трансферов игры это пока не отображается",
      "Отображается в «Изменениях», где одна отмена возвращает всё",
    ],
    signHint: "В игре ничего не меняется, пока вы не нажмёте «Подписать».",
    sign: "Подписать",
    signing: "Подписание…",

    hint: "В игре ничего не меняется, пока вы не нажмёте «Трансфер».",
    move: "Трансфер",
    moving: "Трансфер…",
    cancel: "Отмена",
    swapHint: "В игре ничего не меняется, пока вы не нажмёте «Обменять».",
    swap: "Обменять",
    swapping: "Обмен…",
  },

  ties: {
    heading: "Гражданство и доморощенность",
    nationalities: "Вторые гражданства",
    trainedInNation: "Подготовлен в стране",
    trainedAtClub: "Подготовлен в клубе",
    workPermit: "Не нужно разрешение на работу в",
    none: "Нет",
    rules: {
      1: "Доморощенный 15-21",
      2: "Доморощенный 0-21",
      5: "Доморощенный 15-21 (без аренд)",
      10: "Доморощенный 0-19 (1 год)",
    },
    rule: (code) => `Правило доморощенности ${format(code)}`,

    change: "Изменить",
    changeTitle: "Изменить вторые гражданства и доморощенность этого игрока в игре",
    title: "Гражданство и доморощенность",
    hint: "Каждое изменение сразу записывается в игру и отображается в «Изменениях», где его можно отменить.",
    full:
      "Игра сделала список этого игрока ровно такого размера, чтобы вместить имеющееся: гражданство или место " +
      "подготовки можно изменить или убрать, но не добавить.",
    nationOf: (name) => `Страна вместо ${name}`,
    ruleOf: (name) => `Правило доморощенности для ${name}`,
    remove: "Убрать",
    removeTitle: (name) => `Убрать ${name}`,
    addNationality: "Добавить гражданство…",
    addNation: "Добавить страну…",
    addPermit: "Добавить страну без разрешения на работу…",
    daysLeft: (days) => `осталось ${counted(days, "день", "дня", "дней")}`,
    permitInfoLabel: "Что это делает?",
    permitInfo:
      "Игра позволяет игрокам из Евросоюза, которые были в Англии или Шотландии до Брексита, играть там без " +
      "разрешения на работу в течение некоторого числа дней. Игроку, которому это дано, тоже не нужно разрешение на " +
      "работу в этой стране на столько дней, сколько осталось у них (десять лет, если ни у кого в сохранении этого нет).",
    newRule: "Правило доморощенности новой страны",
    add: "Добавить",
    changeClub: "Сменить клуб",
    changeClubTitle: (name) => `Сделать его подготовленным в другом клубе вместо ${name}`,
    clubInsteadOf: (name) => `Клуб вместо ${name}`,
    addClub: "Добавить клуб…",
    addClubTitle: "Сделать его подготовленным ещё в одном клубе",
    newClub: "Новый клуб",
    pickAnother: "Выбрать другой",
    newClubRule: "Правило доморощенности нового клуба",
    cancel: "Отмена",
    working: "Запись в игру…",
    close: "Закрыть",
  },

  clauses: {
    change: "Изменить",
    changeTitle: "Изменить бонусы и пункты контракта этого игрока в игре",
    title: "Бонусы и пункты",
    hint: "Каждое изменение сразу записывается в игру и отображается в «Изменениях», где его можно отменить.",
    full:
      "Игра сделала список этого контракта ровно такого размера, чтобы вместить имеющееся: бонус или пункт можно " +
      "изменить или убрать, но отступные добавить нельзя.",
    amountOf: (name) => `Сумма: ${name}`,
    conditionOf: (name) => `Условие: ${name}`,
    save: "Сохранить",
    remove: "Убрать",
    removeTitle: (name) => `Убрать ${name}`,
    addRelease: "Добавить отступные",
    releaseAmount: "Сумма новых отступных",
    add: "Добавить",
    outOfRange: (max) => `Введите целое число от 0 до ${max}.`,
    working: "Запись в игру…",
    close: "Закрыть",
  },

  release: {
    button: "Отпустить",
    buttonTitle: "Отпустить этого игрока из клуба в игре: он станет свободным агентом",

    title: "Отпустить",
    from: "Покидает",
    checking: "Проверка…",
    ready: (club) => `${club} → свободный агент`,
    doesHeading: "Что это делает",
    does: [
      "Покидает все команды клуба, контракт расторгается: свободный агент, которого может подписать любой клуб",
      "Никому ничего не выплачивается",
      "Капитанство в клубе остаётся свободным",
      "В истории трансферов игры это не отображается",
      "Отображается в «Изменениях», где одна отмена возвращает игрока на прежний контракт",
    ],

    hint: "В игре ничего не меняется, пока вы не нажмёте «Отпустить».",
    release: "Отпустить",
    releasing: "Отпускаем…",
    cancel: "Отмена",
  },

  rename: {
    button: "Переименовать",
    buttonTitle: "Изменить имена этого игрока в игре",

    title: "Переименовать",
    loading: "Чтение имён…",
    first: "Имя",
    last: "Фамилия",
    common: "Общепринятое имя",
    commonHint:
      "Имя, которое игра показывает вместо имени и фамилии, как у Pedri или Vinícius Júnior. Оставьте пустым, чтобы его не было",
    full: "Полное имя",
    fullHint: "Имя целиком, как его даёт профиль. Оставьте пустым, чтобы его не было",
    none: "Нет",
    required: "Не может быть пустым",
    tooLong: (max: number) => `Слишком длинно: не более ${max} байт`,
    noRoom:
      "Сейчас в игре нет места для ещё одного нового имени такого вида: сохраните игру, загрузите сохранение заново и попробуйте снова",
    unavailable: "В этой версии игры редактор не может менять имена",
    doesHeading: "Что это делает",
    does: [
      "Игра показывает новое имя, как только вы нажмёте в ней «Продолжить»",
      "Имя сохраняется при сохранении игры",
      "Новое имя, фамилия или общепринятое имя попадает в таблицы имён игры, где игра использует его только для этого игрока",
      "Отображается в «Изменениях», по строке на каждое имя; «Отменить» возвращает прежнее имя",
    ],

    hint: "В игре ничего не меняется, пока вы не нажмёте «Переименовать».",
    rename: "Переименовать",
    renaming: "Переименование…",
    cancel: "Отмена",
  },

  permanent: {
    title: "Выкупить из аренды",
    stays: "Остаётся в",
    leaves: "Покидает",
    checking: "Проверка…",
    doesHeading: "Что это делает",
    does: [
      "Он остаётся там, где играет, теперь по контракту с этим клубом с сегодняшнего дня на указанных условиях",
      "Сохраняет номер и статус в команде, которые у него там есть",
      "Покидает все команды своего клуба, аренда заканчивается",
      "В истории трансферов игры это не отображается",
      "Отображается в «Изменениях» как трансфер, где одна отмена возвращает аренду",
    ],
    optionFee: (money) => `Заполнено из опции выкупа по аренде: ${money}`,
    hint: "В игре ничего не меняется, пока вы не нажмёте «Выкупить».",
    confirm: "Выкупить",
    confirming: "Выкупаем…",
    cancel: "Отмена",
  },

  recall: {
    title: "Вернуть из аренды",
    from: "В аренде в",
    to: "Возвращается в",
    doesHeading: "Что делает возврат",
    does: (parent) => [
      "Сегодня становится последним днём аренды: когда день закончится, игра сама завершит аренду",
      `Продвиньтесь в игре на один день, и он вернётся в ${parent}`,
      "До тех пор это отображается в «Изменениях», где отмена возвращает прежнюю дату окончания аренды",
    ],
    termsHeading: "В игре",
    notRecallable: (parent) => `Условия аренды не позволяют клубу ${parent} отозвать его`,
    notTerminable: "Аренду нельзя прекратить досрочно",
    worksAnyway: "Возврат здесь всё равно работает: он не использует отзыв игры, а переносит последний день аренды",
    dropsOption: (club, amount) =>
      `Опция клуба ${club} выкупить его за ${amount} убирается: иначе по окончании аренды игра может продать его в ${club}`,
    hint: "В игре ничего не меняется, пока вы не нажмёте «Вернуть».",
    confirm: "Вернуть",
    confirming: "Возвращаем…",
    cancel: "Отмена",
  },

  squad: {
    teamsLabel: "Команда",
    teams: {
      first: "Основная команда",
      b: "Вторая команда",
      age: (limit) => `U${limit}`,
      other: (place) => `Команда ${place}`,
    },
    noTeams: "У этого клуба нет команд.",
    loading: "Чтение состава…",
    empty: "В этой команде нет игроков.",

    players: (count) => playerCount(count),
    averageAge: (age) => `средний возраст ${age}`,
    captains: (captain, viceCaptain) => `Капитан: ${captain} · Вице-капитан: ${viceCaptain}`,

    actionsLabel: "Действия для всей команды",
    healAll: (injured) => (injured === 0 ? "Вылечить всех" : `Вылечить всех (травмировано: ${format(injured)})`),
    healAllTitle: "Вылечить все травмы всех игроков этой команды",
    healNone: "В этой команде никто не травмирован",
    liftAll: (banned) => (banned === 0 ? "Снять дисквалификации" : `Снять дисквалификации (${format(banned)})`),
    liftAllTitle: "Снять все дисквалификации всех игроков этой команды",
    liftNone: "В этой команде никто не дисквалифицирован",
    inspireAll: "Воодушевить всех",
    inspireAllTitle: "Поднять мораль всех игроков этой команды до 20, максимума, и убрать их причины недовольства",
    maxCohesion: "Максимум сыгранности",
    maxCohesionTitle:
      "Поднять сыгранность с клубом всех игроков этой команды до 100, максимума. Игра покажет сыгранность команды на странице «Динамика» после продвижения: нажмите «Продолжить» в игре",
    cohesionNone:
      "Редактор не может прочитать сыгранность этой команды: эта версия игры не проверена для этого или ни у одного из её игроков нет записи для клуба",
    cohesionWithout: (count) =>
      `Ещё нет сыгранности с клубом: ${playerCount(count)}`,
    maxTactics: "Максимум тактики",
    maxTacticsTitle:
      "Довести знание тактики, которую играет команда, у каждого игрока этой команды до максимума во всех восьми областях экрана «Тактическая эффективность», как после недель тренировок. Атрибуты не меняются. По мере того как тренировки стареют, примерно через шесть недель, области снова снижаются, а для другой тактики нужно нажать ещё раз. Игра покажет изменения, когда пойдёт дальше: нажмите «Продолжить» в игре",
    tacticsNone:
      "Редактор не может прочитать, насколько эта команда знает свою тактику: эта версия игры не проверена для этого, или команда играет не ту тактику, которую выбираете вы",
    tacticsUntrained: (count) =>
      `Не тренируются (например, из-за травмы), их история тренировок остаётся как есть: ${playerCount(count)}`,
    refreshAll: "Освежить всех",
    refreshAllTitle: "Поднять энергию и игровую форму всех игроков этой команды до 100% и дать им полностью отдохнуть (усталость -500)",
    maxAll: "Максимум атрибутов",
    maxAllTitle:
      "Поднять все атрибуты всех игроков этой команды до максимума: 20, и 1 для склонности к травмам и грубости",
    hint: "Действия затрагивают всех игроков списка, включая находящихся в аренде. Отмена есть и в разделе «Изменения».",

    freezeLabel: "Заморозить всю команду",
    freezeAttributes: "Заморозить атрибуты",
    freezeAttributesTitle:
      "Пока приложение открыто и подключено, атрибуты всех игроков этой команды не ухудшаются: то, что отнимает " +
      "игра, возвращается, а улучшения сохраняются",
    freezeFitness: "Заморозить энергию и форму",
    freezeFitnessTitle:
      "Пока приложение открыто и подключено, энергия и игровая форма всех игроков этой команды не снижаются: то, что " +
      "отнимает игра, возвращается. Сначала нажмите «Освежить всех», чтобы держать их на 100%",
    freezePositions: "Заморозить позиции",
    freezePositionsTitle:
      "Пока приложение открыто и подключено, владение позициями всех игроков этой команды остаётся как есть: " +
      "оценка, которую игра повышает или понижает, возвращается",
    frozenCount: (frozen, total) => `${format(frozen)} из ${format(total)}`,
    freezeHint:
      "Заморозка распространяется на всех игроков списка и остаётся с каждым, куда бы он ни перешёл. Приложение " +
      "запоминает её для этого сохранения.",
    frozeAttributes: (count) =>
      count === 0 ? "Их атрибуты уже были заморожены" : `Заморожены атрибуты: ${playerCount(count)}`,
    unfrozeAttributes: (count) => `Разморожены атрибуты: ${playerCount(count)}`,
    frozeFitness: (count) =>
      count === 0 ? "Их энергия и форма уже были заморожены" : `Заморожены энергия и форма: ${playerCount(count)}`,
    unfrozeFitness: (count) => `Разморожены энергия и форма: ${playerCount(count)}`,
    frozePositions: (count) =>
      count === 0 ? "Их позиции уже были заморожены" : `Заморожены позиции: ${playerCount(count)}`,
    unfrozePositions: (count) => `Разморожены позиции: ${playerCount(count)}`,

    written: (count) => `Записано: ${changes(count)}`,
    refused: (name, reason) => `${name}: ${reason}`,
    undo: "Отменить",
    undoTitle: "Записать прежние значения этих изменений обратно в игру",

    captainShort: "К",
    viceCaptainShort: "ВК",
    menuLabel: (name) => `Капитанство: ${name}`,
    menuTitle: "Капитанство",
    makeCaptain: "Сделать капитаном",
    makeViceCaptain: "Сделать вице-капитаном",
    nowCaptain: (name) => `${name} теперь капитан`,
    nowViceCaptain: (name) => `${name} теперь вице-капитан`,
    noCaptain: "Теперь капитана нет",
    noViceCaptain: "Теперь вице-капитана нет",

    tableLabel: (team) => `Игроки: ${team}`,
    openProfile: "Открыть профиль игрока",
    columns: {
      name: "Имя",
      position: "Поз",
      age: "Возр",
      currentAbility: "ТУ",
      potentialAbility: "ПОТ",
      condition: "Энергия",
      matchSharpness: "Форма",
      jadedness: "Устал.",
      morale: "Мораль",
      cohesion: "Сыгр.",
      tactics: "Тактика",
      actions: "Капитанство",
    },
    sortBy: (by) => `Сортировать: ${by}`,
    sortNames: {
      name: "имя",
      position: "позиция",
      age: "возраст",
      currentAbility: "текущий уровень",
      potentialAbility: "потенциал",
      condition: "энергия",
      matchSharpness: "игровая форма",
      jadedness: "усталость",
      morale: "мораль",
      cohesion: "сыгранность",
      tactics: "знание тактики",
    },

    injured: "Травма",
    injuredTitle: (count) => counted(count, "травма", "травмы", "травм"),
    banned: "Дискв.",
    bannedTitle: (count) => counted(count, "дисквалификация", "дисквалификации", "дисквалификаций"),
    unrest: "Напряжённость",
    unrestTitle: (count) =>
      `Недовольны им: ${counted(count, "партнёр", "партнёра", "партнёров")} по команде. «Убрать всё» в его профиле снимет это после продвижения игры`,
    onLoan: "В аренде",
    onLoanTitle: "Отдан в аренду в другой клуб",
    loanee: "Арендован",
    loaneeTitle: "Здесь в аренде из другого клуба",
    elsewhere: "В другой команде",
    elsewhereTitle: "Играет за другую команду клуба",
    frozen: "Заморожен",
    frozenTitle: (attributes, fitness, positions) => {
      const frozen = [
        ...(attributes ? ["атрибуты"] : []),
        ...(fitness ? ["энергия", "игровая форма"] : []),
        ...(positions ? ["позиции"] : []),
      ];
      const last = frozen.pop() ?? "";
      const listed = frozen.length > 0 ? `${frozen.join(", ")} и ${last}` : last;
      return `Заморожено: ${listed}`;
    },
  },

  game: {
    name: "Football Manager",
    storefronts: {
      gamePass: "Game Pass",
      steam: "Steam",
      epic: "Epic Games",
      unknown: "Неизвестный магазин",
    },
    steamBuild: (id) => `сборка ${id}`,
  },

  scouting: {
    nav: "Скаутинг",
    reading: "Чтение вашего клуба…",
    refresh: "Обновить",
    refreshTitle: "Снова прочитать клуб из игры",
    searching: "Поиск…",
    none: "—",
    perWeek: "/нед",
    openProfile: "Открыть профиль",
    freeAgent: "Свободный агент",
    loan: "Аренда",
    header: {
      transferBudget: "Трансферный бюджет",
      wageRoom: "Запас по зарплатам",
      wageBudget: "Зарплатный бюджет",
      squad: "Состав",
      averageAge: "Средний возраст",
      players: (count) => playerCount(count),
    },
    tabs: {
      label: "Разделы скаутинга",
      recommend: "Советы по трансферам",
      opportunities: "Возможности",
      similar: "Похожие игроки",
      depth: "Глубина состава",
      departures: "Кого отпустить",
      youth: "Выпуск академии",
    },
    status: {
      missing: "Нет",
      thin: "Мало",
      fine: "Норма",
      crowded: "Избыток",
    },
    lines: {
      goalkeeper: "Вратарь",
      centreBack: "Центральный защитник",
      fullBack: "Крайний защитник",
      wingBack: "Латераль",
      defensiveMidfield: "Опорная зона",
      centralMidfield: "Центр полузащиты",
      attackingMidfield: "Атакующая полузащита",
      wide: "Фланг",
      striker: "Нападающий",
    },
    depthLines: {
      gk: "Вратари",
      dc: "Центральные защитники",
      rightBack: "Правые защитники",
      leftBack: "Левые защитники",
      dm: "Опорные полузащитники",
      mc: "Центральные полузащитники",
      rightWing: "Правые вингеры",
      leftWing: "Левые вингеры",
      amc: "Атакующие полузащитники",
      st: "Нападающие",
    },
    positionTip: (line, count, target, status) =>
      `${line}: в составе ${format(count)} (обычно ${format(target)}) — ${status}`,
    brief: {
      heading: "Кого вы ищете?",
      pitch: "Позиция",
      legend: "Точки показывают положение состава в каждой линии.",
      inPossession: "С мячом",
      outOfPossession: "Без мяча",
      anyRole: "Любая — лучшая роль для каждого игрока",
      purpose: "Для",
      filters: "Фильтры",
      minAge: "Мин. возраст",
      maxAge: "Макс. возраст",
      maxFee: "Макс. сумма",
      minProbability: "Вероятность",
      anyProbability: "Любая",
      noFreeAgents: "Без свободных агентов",
    },
    purposes: {
      firstTeam: "Основа",
      rotation: "Ротация",
      future: "На будущее",
      any: "Все",
    },
    purposeTips: {
      firstTeam: "Лучше вашего лучшего игрока на этой позиции",
      rotation: "Не хуже вашего второго варианта, по разумной цене",
      future: "21 год или младше, с запасом для роста",
      any: "Все, кто подходит",
    },
    ask: {
      before: "Советы для позиции ",
      after: "",
      anyRole: "лучшая роль для каждого",
    },
    own: {
      heading: "В вашем составе",
      empty: "В вашем составе никто здесь не играет.",
      position: "Позиция",
    },
    summary: (candidates, eligible, shown, purpose) =>
      `Могут играть здесь: ${format(candidates)} · подходят для «${purpose}»: ${format(eligible)} · рекомендовано: ${format(shown)}`,
    how: {
      label: "Как составлен этот список?",
      note: (rule, count) =>
        `Из игроков с оценкой 10 и выше на этой позиции (кроме игроков вашего клуба и других менеджеров-людей) берутся те, кто ${rule}. Показаны лучшие ${count} по соответствию (70%) и вероятности (30%); для «Ротации» оба фактора весят одинаково, а для «На будущее» учитывается и потенциал. Щёлкните заголовок столбца, чтобы отсортировать.`,
    },
    purposeRules: {
      firstTeam: "подходит на позицию лучше вашего лучшего игрока там",
      rotation: "подходит не хуже вашего второго варианта",
      future: "в возрасте 21 года или младше и с запасом для роста (потенциал хотя бы на 15 выше уровня)",
      any: "вообще подходит",
    },
    sortBy: (by) => `Сортировать: ${by}`,
    sortNames: {
      rank: "порядок скаута",
      name: "имя",
      age: "возраст",
      ca: "текущий уровень",
      pa: "потенциал",
      fit: "соответствие",
      probability: "вероятность",
      fee: "сумма",
      similarity: "сходство",
    },
    backToScoutOrder: "Вернуть порядок скаута",
    showMore: (count) => `Показать ещё ${format(count)}`,
    playsFor: (club) => `играет за ${club}`,
    empty: "Нет советов для этой позиции с такими настройками. Попробуйте цель «Все» или более мягкие фильтры.",
    columns: {
      rank: "#",
      ca: "ТУ",
      pa: "ПОТ",
      player: "Игрок",
      age: "Возраст",
      fit: "Соотв.",
      role: "Роль",
      probability: "Вероятность",
      fee: "Оценка суммы",
      wage: "Зарплата",
      note: "Заметка скаута",
      money: "Сумма",
      value: "Стоимость",
    },
    probabilityInfo:
      "Насколько вероятен переход игрока в ваш клуб — оценка по его стоимости, контракту, клубу и репутации.",
    probabilityInfoLabel: "Что такое вероятность?",
    fitTitle: (inPossession, outOfPossession, position) =>
      [
        inPossession !== null && `С мячом: ${inPossession}`,
        outOfPossession !== null && `Без мяча: ${outOfPossession}`,
        `Позиция: ${position}`,
      ]
        .filter(Boolean)
        .join("\n"),
    note: "Соответствие считается по собственным весам атрибутов редактора для каждой роли; суммы, зарплаты и вероятности — оценочные.",
    depth: {
      summary: (size, age, level) =>
        `${playerCount(size)}${age === null ? "" : ` · средний возраст ${age}`} · средний уровень лучшей одиннадцатки ${level}`,
      weak: "Ниже уровня состава",
      ageing: "Стареет",
      cover: (names) => `Также могут сыграть здесь: ${names}`,
      advice: "Получить совет",
      adviceTitle: "Советы по трансферам для этой линии",
      empty: "Никого",
      ability: "Текущий уровень",
      more: (count) => `+${format(count)} ещё`,
      columns: {
        line: "Линия",
        status: "Статус",
        count: "Игроки",
        players: "Лучшие первыми (уровень)",
        cover: "Также могут сыграть",
        age: "Ср. возраст",
      },
      countTitle: (count, target) =>
        `Игроков, чья лучшая позиция в этой линии: ${format(count)}; обычно в составе ${format(target)}`,
      statusHelp: {
        missing: "Здесь никто не играет.",
        thin: "Меньше, чем обычно бывает в составе; игроки, способные подменить, считаются за половину.",
        fine: "Примерно столько, сколько обычно бывает в составе.",
        crowded: "На два или более игроков больше, чем обычно бывает в составе.",
      },
      attention: "Требует внимания:",
      allFine: "Все линии выглядят сбалансированными.",
      views: { label: "Показать состав как", pitch: "Поле", table: "Таблица" },
      pitchLabel: "Состав на поле, линия за линией",
      coverCount: (count) => `Могут подменить: ${format(count)}`,
      adviceFor: (position) => `Советы по трансферам: ${position}`,
    },
    departures: {
      intro: "Игроки, которых ваш скаут отпустил бы, — сначала самые срочные.",
      filter: "Совет",
      all: "Все",
      empty: "Сейчас ваш скаут никого бы не отпустил.",
      sortNames: {
        rank: "порядок скаута",
        name: "имя",
        age: "возраст",
        ca: "текущий уровень",
        pa: "потенциал",
        value: "стоимость",
        wage: "зарплата",
        contract: "окончание контракта",
      },
      columns: {
        player: "Игрок",
        age: "Возраст",
        ability: "Уровень",
        value: "Стоимость",
        wage: "Зарплата",
        contract: "Контракт до",
        advice: "Совет",
        reasons: "Причины",
      },
      actions: { sell: "Продать", loan: "В аренду", release: "Отпустить" },
      rank: (line, rank) => `${line} · ${rank}-й`,
    },
    actions: {
      column: "Действия",
      compare: "Сравнить с вашим составом",
      compareLabel: (name) => `Сравнить игрока ${name} с вашим составом`,
      similar: "Найти похожих игроков",
      similarLabel: (name) => `Найти игроков, похожих на ${name}`,
      report: "Отчёт скаута",
      reportLabel: (name) => `Отчёт скаута об игроке ${name}`,
      replacement: "Найти замену",
      replacementLabel: (name) => `Найти замену для ${name}`,
      replacementTitle: "Игроки, похожие на него, которые могли бы занять его место",
    },
    why: {
      freeAgent: () => "Свободный агент",
      expiring: (value) => `Контракт истекает через ${value} дн.`,
      releaseClause: (value, against) =>
        against === null ? `Отступные ${value}` : `Отступные ${value} (стоимость ${against})`,
      unhappy: (value) => (value === "1" ? "Недоволен в своём клубе" : `Недоволен в своём клубе (причин: ${value})`),
      inTheRed: (value) => `Его клуб в минусе (${value})`,
      listed: () => "Выставлен на трансфер",
      loanListed: () => "Выставлен на аренду",
      wonderkid: (value) => `Потенциал ${value}`,
    },
    verdicts: {
      better: "Лучше вашего первого номера",
      close: "Близок к вашему первому номеру",
      below: "Слабее вашего первого номера",
      none: "В вашем составе здесь никто не играет",
    },
    chances: { likely: "Скорее всего перейдёт", possible: "Может перейти", hard: "Трудно подписать" },
    opportunities: {
      kindsLabel: "Списки возможностей",
      kinds: {
        bosman: "Босман",
        releaseClause: "Отступные",
        unhappy: "Недовольные",
        inTheRed: "Клубы в минусе",
        listed: "Выставлены на трансфер",
        loanListed: "Выставлены на аренду",
        wonderkid: "Вундеркинды",
      } satisfies Record<OpportunityKind, string>,
      hints: {
        bosman: "Свободные агенты и контракты, истекающие в течение полугода",
        releaseClause: "Отступные ниже его стоимости",
        unhappy: "Недоволен в своём клубе",
        inTheRed: "Его клубу нужны деньги",
        listed: "Его клуб готов продать",
        loanListed: "Его клуб готов отдать в аренду",
        wonderkid: "19 лет или младше, с большим будущим",
      } satisfies Record<OpportunityKind, string>,
      countLabel: "Игроков в этом списке",
      count: (count, more) => (more ? `${format(count)}+` : format(count)),
      position: "Позиция",
      anyPosition: "Любая позиция",
      maxAge: "Макс. возраст",
      maxFee: "Макс. сумма",
      betterOnly: "Лучше моего первого номера",
      betterOnlyTitle: "Только игроки, которые подходят на свою позицию лучше вашего лучшего игрока там",
      summary: (kind, lowest, highest, pool) =>
        `${kind} · игроки с уровнем ${lowest}–${highest}, около уровня вашего состава · просмотрено: ${pool}`,
      how: {
        label: "Как составляются эти списки?",
        note: "Игроки, чей уровень близок к уровню вашего лучшего состава (от 30 ниже до 45 выше), кроме игроков вашего клуба и других менеджеров-людей; каждого оценивают на его лучшей позиции или на выбранной вами. Каждый список упорядочен по соответствию и вероятности вместе.",
      },
      empty: "С этими фильтрами в этом списке никого нет.",
      emptyWonderkids: "С этими фильтрами вундеркиндов нет.",
      better: "Здесь лучше вашего первого номера",
      columns: { position: "Поз.", why: "Почему" },
    },
    similar: {
      intro: "Выберите игрока, чтобы найти похожих: сравниваются атрибуты, нужные на его позиции.",
      search: "Игрок для сравнения",
      searchPlaceholder: "Поиск игрока по имени…",
      noMatch: "Игрока с таким именем нет.",
      quickPicks: "Или начните с одного из ваших игроков:",
      change: "Выбрать другого игрока",
      reference: "Игроки, похожие на",
      position: "Сравнивать на позиции",
      cheaper: "Дешевле",
      cheaperTitle: "Только игроки, стоящие меньше него",
      younger: "Моложе",
      youngerTitle: "Только игроки моложе него",
      maxFee: "Макс. сумма",
      value: "Стоимость",
      notForSale: "Не продаётся",
      doesNotPlay: (position) => `Он не играет на позиции ${position}: сравниваются только атрибуты.`,
      summary: (candidates, shown, position) =>
        `Играют на позиции ${position}: ${candidates} · самые похожие: ${shown}`,
      how: {
        label: "Как измеряется сходство?",
        note: "Скаут сравнивает атрибуты, на которых держатся роли этой позиции, ключевые — сильнее всего. В чём игрок силён и в чём слаб, важнее его уровня, поэтому более дешёвый или молодой игрок тоже может быть очень похож.",
      },
      empty: "С этими настройками похожих нет.",
      columns: { similarity: "Сходство", value: "Стоимость" },
      similarityTitle: (value) => `Сходство ${format(value)}%`,
    },
    compare: {
      title: "Сравнить с вашим составом",
      hint: (position, name) => `С игроком ${name}, вашим лучшим на позиции ${position}. Сначала ключевые атрибуты роли.`,
      noStarter: "В вашем составе никто не играет на этой позиции.",
      starter: "Ваш первый номер",
      candidate: "Кандидат",
      inPossession: "С мячом",
      outOfPossession: "Без мяча",
      add: "Добавить игрока",
      addNone: "Выберите из списка…",
      remove: (name) => `Убрать игрока ${name} из сравнения`,
      removeShort: "Убрать",
      scoutView: "Взгляд скаута",
      rows: {
        fit: "Соответствие",
        position: (position) => `На позиции ${position}`,
        roleRating: (role) => `В роли «${role}»`,
        probability: "Вероятность",
        fee: "Оценка суммы",
        wage: "Зарплата",
        contract: "Контракт до",
        verdict: "Вердикт",
      },
      ownPlayer: "Ваш игрок",
      roleAttributes: (roles) => `Атрибуты роли: ${roles}`,
      keyAttribute: "Ключевой атрибут роли",
      versus: (difference) => `${difference} относительно вашего первого номера`,
      best: "лучший",
      age: (age) => `Возраст ${format(age)}`,
      allAttributes: "Все атрибуты",
      loading: "Чтение игроков…",
      close: "Закрыть",
    },
    report: {
      title: (name) => `Отчёт скаута: ${name}`,
      hint: "Сохраните как изображение или скопируйте, чтобы поделиться.",
      making: "Составление отчёта…",
      failed: (reason) => `Не удалось составить отчёт: ${reason}`,
      alt: (name) => `Отчёт скаута об игроке ${name}`,
      save: "Сохранить как изображение",
      savePdf: "Сохранить в PDF",
      saving: "Сохранение…",
      copy: "Копировать изображение",
      copied: "Скопировано в буфер обмена.",
      copyFailed: (reason) => `Не удалось скопировать изображение: ${reason}`,
      similar: "Найти похожих игроков",
      saved: (file) => `Сохранено как ${file}.`,
      open: "Открыть",
      show: "Показать в папке",
      close: "Закрыть",
      heading: "Отчёт скаута",
      age: (age) => `Возраст ${format(age)}`,
      freeAgent: "Свободный агент",
      contract: "контракт до",
      fit: "Соответствие",
      probability: "Вероятность",
      fee: "Оценка суммы",
      abilities: "ТУ / ПОТ",
      value: "Стоимость",
      role: "Роль",
      strengths: "Сильные стороны",
      weaknesses: "Слабые стороны",
      profile: "Характер",
      note: "Заметка скаута",
      similarity: (value) => `Сходство ${format(value)}%`,
      footer: "Отчёт скаута FMLibreEditor · суммы, зарплаты и вероятности — оценки",
      traits: {
        consistent: "Стабильный",
        inconsistent: "Нестабильный",
        bigGames: "Игрок больших матчей",
        nervous: "Нервничает в больших матчах",
        injuryProne: "Склонен к травмам",
        robust: "Редко травмируется",
        versatile: "Универсал",
        professional: "Образцовый профессионал",
        ambitious: "Честолюбивый",
        loyal: "Верный",
        hotHeaded: "Вспыльчивый",
      },
    },
    /** "Выпуск академии": the players the game made at a club's youth intakes, by the day they joined it, and their edits. */
    youth: {
      intro: "Игроки, которых игра создала в молодёжных наборах клуба и которые всё ещё в нём, по дню, когда они пришли.",
      otherClub: "Посмотреть другой клуб",
      searchLabel: "Клуб для просмотра",
      mine: "Вернуться к моему клубу",
      intakesLabel: "Молодёжные наборы",
      /** A day nothing says. */
      noDay: "День неизвестен",
      /** `best` is a name and the potential in brackets. */
      summary: (count, average, best) => `${playerCount(count)} · средний потенциал ${average} · лучший: ${best}`,
      lent: (count) => `${format(count)} в аренде`,
      how: {
        label: "Как составлен этот список?",
        note: "Игроки, созданные игрой, которые пришли в этот клуб в 17 лет или моложе и не тренировались ни в каком другом клубе, по дню прихода. Те, кто в аренде, в списке; проданные или отпущенные — нет.",
      },
      unmarked:
        "Редактор не знает, как эта версия игры отмечает созданных ею игроков, поэтому в список попали и собственные молодые игроки клуба из базы данных игры.",
      empty: (club) => `В клубе ${club} сейчас нет игроков молодёжных наборов.`,
      emptyHint: "Игроки набора показаны здесь, пока они в клубе. Посмотрите другой клуб, чтобы увидеть его молодёжный набор.",
      columns: {
        player: "Игрок",
        position: "Поз",
        born: "Дата рождения",
        nation: "Страна",
        city: "Город рождения",
        ca: "ТУ",
        pa: "ПОТ",
        actions: "Изменить",
      },
      age: (age) => `Возраст ${format(age)}`,
      joinedAt: (age) => `пришёл в ${format(age)}`,
      onLoan: (club) => `В аренде в клубе ${club}`,
      youthContract: "Молодёжный контракт",
      edit: (name) => `Изменить: ${name}`,
      editor: {
        label: (name) => `Редактирование: ${name}`,
        reading: "Чтение его значений…",
        dateOfBirth: "Дата рождения",
        nation: "Гражданство",
        city: "Город рождения",
        /** The city select of a player without a city: the game keeps none for him, and the editor sets none. */
        noCity: "Нет в игре",
        /** Above the cities of the nation picked: they are the ones people of the save were born in. */
        cityHint: "Города, где родились люди этого сохранения",
        ca: "Текущий уровень",
        pa: "Потенциал",
        save: "Сохранить",
        saving: "Сохранение…",
        cancel: "Отмена",
        profile: "Полный профиль",
        profileTitle: "Позиции, атрибуты и всё остальное — в профиле игрока",
        nothing: "Нечего сохранять: ни одно значение не изменено.",
        saved: (count) => `Сохранено: ${changes(count)}.`,
        failed: (field, reason) => `${field}: ${reason}`,
        invalid: (field) => `${field}: недопустимое значение.`,
      },
      loading: "Чтение молодёжных наборов…",
      failed: (reason) => `Не удалось прочитать молодёжные наборы: ${reason}`,
    },
    roles: {
      bgk: "Вратарь-распасовщик",
      ngk: "Надёжный вратарь",
      sk: "Вратарь-чистильщик",
      lhk: "Вратарь на линии",
      cb: "Центральный защитник",
      bcb: "Центральный защитник-распасовщик",
      ncb: "Надёжный центральный защитник",
      acb: "Продвинутый центральный защитник",
      ocb: "Подключающийся центральный защитник",
      scb: "Центральный защитник-стоппер",
      ccb: "Страхующий центральный защитник",
      wcb: "Фланговый центральный защитник",
      fb: "Крайний защитник",
      ifb: "Инвертированный крайний защитник",
      pfb: "Прессингующий крайний защитник",
      hfb: "Сдерживающий крайний защитник",
      wb: "Латераль",
      iwb: "Инвертированный латераль",
      pwb: "Латераль-плеймейкер",
      awb: "Атакующий латераль",
      hwb: "Сдерживающий латераль",
      dm: "Опорный полузащитник",
      hb: "Хавбек",
      ddm: "Опускающийся опорный полузащитник",
      pdm: "Прессингующий опорный полузащитник",
      bbm: "Полузащитник «от штрафной до штрафной»",
      bbp: "Плеймейкер «от штрафной до штрафной»",
      cm: "Центральный полузащитник",
      pcm: "Прессингующий центральный полузащитник",
      scm: "Прикрывающий центральный полузащитник",
      chm: "Полузащитник в коридорах",
      wcm: "Фланговый центральный полузащитник",
      ap: "Атакующий плеймейкер",
      am: "Атакующий полузащитник",
      oam: "Атакующий полузащитник-отдушина",
      w: "Вингер",
      if: "Инсайд",
      pw: "Вингер-плеймейкер",
      wfd: "Фланговый нападающий",
      tw: "Отрабатывающий вингер",
      iow: "Инсайд-отдушина",
      cfd: "Центральный нападающий",
      dlf: "Оттянутый нападающий",
      p: "Браконьер",
      tcf: "Отрабатывающий центральный нападающий",
      ocf: "Центральный нападающий-отдушина",
    },
    reasons: {
      listed: () => "Выставлен на трансфер",
      freeAgent: () => "Свободный агент",
      expiring: (value) => `Контракт истекает через ${value} дн.`,
      releaseClause: (value) => `Отступные ${value}`,
      fringe: () => "Не игрок основы в своём клубе",
      keyPlayer: () => "Ключевой игрок своего клуба",
      unwanted: () => "Не нужен своему клубу",
      overBudget: (value) => `На ${value} больше вашего бюджета`,
      stretch: (value) => `Чуть выше бюджета (+${value})`,
      wageHigh: (value) => `Зарплата на ${value}/нед выше вашего запаса`,
      biggerClub: () => "Играет за более крупный клуб",
      smallerClub: () => "Играет за менее крупный клуб",
      reputationGap: () => "Слишком громкое имя для вашего клуба",
      ambitious: () => "Амбициозен: будет рад шагу вперёд",
      notForSale: () => "Не продаётся",
    },
    departureReasons: {
      surplus: (value) => `Перебор в линии (игроков: ${value})`,
      belowLevel: () => "Ниже уровня состава",
      ageing: (value) => `Стареет (${value})`,
      expiring: (value) => `Контракт истекает через ${value} дн.`,
      highWage: (value) => `Высокая зарплата для его роли (${value}/нед)`,
      unhappy: () => "Недоволен",
      lowMorale: () => "Низкая мораль",
      blocked: () => "Нужна игровая практика для роста",
      unwanted: () => "Статус в команде: не нужен клубу",
      listed: () => "Уже выставлен на трансфер",
    },
  },

  /** The command palette and the names of the keys in the keyboard shortcuts (see en.ts). */
  palette: {
    button: "Поиск",
    title: "Поиск или выполнение действия",
    placeholder: "Поиск игроков, персонала, клубов и действий",
    placeholderCommands: "Поиск действий",
    commands: "Действия",
    goTo: (list: string) => `Перейти: ${list}`,
    searchList: "Искать в этом списке",
    editProfile: "Редактировать этот профиль",
    doneEditing: "Закончить редактирование этого профиля",
    applyChanges: "Применить изменения в этом профиле",
    showAll: (count: number, list: string) => `${list}: показать все результаты (${format(count)})`,
    searching: "Поиск…",
    empty: (query: string) => `По запросу «${query}» ничего не найдено.`,
    notConnected: "Подключитесь к игре, чтобы искать игроков, персонал и клубы.",
    failed: (reason: string) => `Не удалось выполнить поиск: ${reason}`,
    hintMove: "Перемещение",
    hintOpen: "Открыть",
    hintClose: "Закрыть",
    keys: { ctrl: "Ctrl", shift: "Shift", enter: "Enter", escape: "Esc" },
  },

  /** "My club", the page the app opens on (see en.ts). */
  home: {
    nav: "Мой клуб",
    loading: "Поиск вашего клуба…",
    failed: (reason: string) => `Не удалось найти ваш клуб: ${reason}`,
    manager: (name: string) => `Менеджер: ${name}`,
    following: "Клуб, за которым вы следите",
    clubsLabel: "Ваши клубы",
    openProfile: "Профиль клуба",
    openProfileTitle: "Открыть этот клуб на вкладке «Клубы»: инфраструктура, финансы, стадион и другое",
    noClubTitle: "В этом сохранении вы не руководите клубом",
    noClubText:
      "Выберите клуб, за которым хотите следить здесь: его состав, кому нужно внимание, и действия для всей команды.",
    chooseAnother: "Выбрать другой клуб",
    searchLabel: "Клуб для отслеживания",
    squad: "Состав",
    cards: {
      label: "Кому нужно внимание",
      lowMorale: "Низкая мораль",
      tired: "Усталость",
      contracts: "Контракты истекают",
      injuredHint: "Игроки с травмой",
      bannedHint: "Игроки с дисквалификацией",
      lowMoraleHint: (below: string) => `Игроки с моралью ниже ${below}`,
      tiredHint: (below: string) => `Игроки с энергией ниже ${below}`,
      unrestHint: "Игроки, которыми недовольны некоторые партнёры по команде",
      contractsHint: (months: number) => `Игроки, чьи контракты истекают в течение ${months} мес.`,
      none: "Нет",
      more: (count: number) => `и ещё ${format(count)}`,
    },
  },

  /** The calendar of a date field; the months, the weekdays and the days are Intl's. */
  date: {
    previousMonth: "Предыдущий месяц",
    nextMonth: "Следующий месяц",
    month: "Выберите месяц",
    year: "Выберите год",
    today: (date: string) => `Сегодня, ${date}`,
  },

  /** Страница таблиц (`Standings`): по карточке на турнир с его таблицей. */
  standings: {
    nav: "Таблицы",
    summary: (count) => `${format(count)} турниров`,
    perScreen: "Таблиц на экране",
    previous: "Предыдущая страница",
    next: "Следующая страница",
    page: (page, pages) => `Страница ${format(page)} из ${format(pages)}`,
    competition: "Турнир",
    choose: "Выберите турнир",
    columns: {
      rank: "М",
      club: "Клуб",
      played: "И",
      won: "В",
      drawn: "Н",
      lost: "П",
      goalDifference: "РГ",
      points: "О",
    },
    legend: {
      champions: "Лига чемпионов",
      europa: "Лига Европы",
      conference: "Лига конференций",
      relegation: "Вылет",
    },
    caption: (competition) => `${competition}: таблица`,
    openClub: (club, rank, points) => `${club}, ${format(rank)}-е место, ${format(points)} очков`,
    unavailable: "Таблицы этой версии пока не читаются.",
    competitionsUnavailable: "Турниры этой версии не читаются.",
    noMatches: "Матчей ещё не было.",
    empty: "Выберите турнир, чтобы увидеть его таблицу.",
    loading: "Чтение турниров (в первый раз — около 20 секунд)…",
  },

  errors,
};
