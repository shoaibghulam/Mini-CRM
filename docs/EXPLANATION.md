# Как устроена система — для руководителя

## По-русски

**Что это.** Небольшая CRM для стройки. Постановщик заводит объекты (стройки) и ставит по ним задачи, назначая исполнителя. Исполнитель видит свои задачи, берёт задачу в работу и сдаёт её на проверку. Постановщик принимает работу или возвращает её на доработку, и при возврате обязательно пишет комментарий. Каждая смена статуса записывается в историю: кто, когда, из какого статуса в какой и с каким комментарием.

**Как защищены данные.** Кнопки на экране — это только удобство. Все проверки делает сама база данных (Supabase). Перед тем как отдать или изменить любую строку, база спрашивает: «Кто это просит и можно ли ему?» Поэтому, даже если человек обойдёт интерфейс и отправит запрос напрямую, база ответит так же строго, как интерфейс. Мы проверили это автоматически: 167 попыток «взлома» через открытый интерфейс базы, и все отклонены.

**Чего не может исполнитель:**
- увидеть чужие задачи, их историю и объекты, где у него нет задач;
- изменить текст задачи, сменить исполнителя или создать, удалить задачу;
- перескочить через этап (например, сразу «Принята») или принять собственную работу;
- подделать, изменить или стереть историю;
- назначить себя постановщиком.

**Ещё.** Регистрация закрыта: учётные записи создаёт администратор. Секретный ключ базы не попадает ни в приложение, ни в репозиторий. Удалённая задача пропадает из списков, но её история сохраняется навсегда.

## In English

**What it is.** A small CRM for construction work. A manager creates sites and assigns tasks to an assignee. The assignee sees their own tasks, starts work, and sends it for review. The manager accepts it or sends it back with a required comment. Every status change is recorded: who, when, from what, to what, and the comment.

**How data is protected.** The buttons on screen are a convenience. The database itself (Supabase) checks every read and write: "who is asking, and are they allowed?" So even if someone bypasses the app and calls the database directly, they get the same strict answer. We verified this with 167 automated attack attempts through the public API, and all were rejected.

**What an assignee cannot do:** see other people's tasks, their history, or sites where they have no tasks; edit task text, reassign, create, or delete tasks; skip a step (for example jump straight to "Accepted") or accept their own work; forge, edit, or erase history; make themselves a manager.

**Also.** Public sign-up is off, and accounts are created by an admin. The database's secret key is never in the app or the repo. A deleted task disappears from lists, but its history is kept for good.
