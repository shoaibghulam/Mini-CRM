// Demo data for scripts/seed.ts. No secrets here: passwords come from the environment.

export type DemoRole = 'manager' | 'assignee';
export type TaskStatus = 'new' | 'in_progress' | 'under_review' | 'accepted' | 'needs_rework';
export type UserKey = 'manager' | 'alice' | 'bob';

export interface DemoUser {
  key: UserKey;
  email: string;
  fullName: string;
  role: DemoRole;
  passwordEnv: 'DEMO_MANAGER_PASSWORD' | 'DEMO_ASSIGNEE_PASSWORD';
}

export const DEMO_USERS: readonly DemoUser[] = [
  { key: 'manager', email: 'manager@demo.test', fullName: 'Иван Петров', role: 'manager', passwordEnv: 'DEMO_MANAGER_PASSWORD' },
  { key: 'alice', email: 'alice@demo.test', fullName: 'Алиса Смирнова', role: 'assignee', passwordEnv: 'DEMO_ASSIGNEE_PASSWORD' },
  { key: 'bob', email: 'bob@demo.test', fullName: 'Борис Иванов', role: 'assignee', passwordEnv: 'DEMO_ASSIGNEE_PASSWORD' },
];

export interface DemoSite {
  name: string;
  address: string;
}

export const DEMO_SITES: readonly DemoSite[] = [
  { name: 'ЖК «Северный парк», корпус 2', address: 'г. Москва, ул. Лётчика Бабушкина, вл. 34' },
  { name: 'Складской комплекс «Восток»', address: 'Московская обл., г. Балашиха, ш. Энтузиастов, д. 52' },
  // Only alice works here: bob must not see this site at all.
  { name: 'Частный дом, пос. Лесной Городок', address: 'Московская обл., Одинцовский г. о., пос. Лесной Городок, ул. Садовая, д. 14' },
];

// One status change, performed through change_task_status() as `by`.
// 'assignee' means "whoever this task is assigned to".
export interface Step {
  to: TaskStatus;
  by: UserKey | 'assignee';
  comment?: string;
}

export interface DemoTask {
  siteIndex: number;
  assignee: 'alice' | 'bob';
  title: string;
  description: string;
  steps: readonly Step[];
}

const START: Step = { to: 'in_progress', by: 'assignee' };
const REVIEW: Step = { to: 'under_review', by: 'assignee' };

export const DEMO_TASKS: readonly DemoTask[] = [
  {
    siteIndex: 0, assignee: 'alice',
    title: 'Армирование плиты перекрытия 5-го этажа',
    description: 'Вязка арматуры по проекту КЖ-5, шаг 200 мм. Защитный слой 25 мм.',
    steps: [START, REVIEW, { to: 'accepted', by: 'manager', comment: 'Принято, замечаний нет.' }],
  },
  {
    siteIndex: 0, assignee: 'bob',
    title: 'Монтаж опалубки колонн 6-го этажа',
    description: 'Щитовая опалубка, 12 колонн в осях А–Г.',
    steps: [
      START, REVIEW,
      { to: 'needs_rework', by: 'manager', comment: 'Опалубка колонн Б-3 и В-3 не по вертикали, отклонение больше 10 мм. Выставить заново.' },
      { to: 'in_progress', by: 'bob' },
    ],
  },
  {
    siteIndex: 0, assignee: 'alice',
    title: 'Гидроизоляция фундамента, секция Б',
    description: 'Наплавляемая гидроизоляция в два слоя, нахлёст не менее 100 мм.',
    steps: [
      START, REVIEW,
      { to: 'needs_rework', by: 'manager', comment: 'Нарушен нахлёст полотна на стыках в осях 3–4. Переделать участок и приложить фото.' },
    ],
  },
  {
    siteIndex: 1, assignee: 'bob',
    title: 'Устройство бетонного пола в осях 1–6',
    description: 'Бетон B25, толщина 150 мм, топпинг и нарезка швов.',
    steps: [START, REVIEW],
  },
  {
    siteIndex: 1, assignee: 'alice',
    title: 'Монтаж секционных ворот, 4 шт.',
    description: 'Ворота 4×4 м с электроприводом, проёмы по оси А.',
    steps: [],
  },
  {
    siteIndex: 1, assignee: 'bob',
    title: 'Прокладка кабельных трасс освещения',
    description: 'Лотки по фермам, кабель ВВГнг-LS 3×2,5.',
    steps: [],
  },
  {
    siteIndex: 2, assignee: 'alice',
    title: 'Кладка наружных стен из газобетона',
    description: 'Блок D500 толщиной 375 мм, армирование каждого 4-го ряда.',
    steps: [START],
  },
];
