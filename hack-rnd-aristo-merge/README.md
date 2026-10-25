# Проект (Backend + Frontend)

Краткое руководство по запуску сервера и фронтенда.

## Быстрый старт

1. Склонируйте проект.
2. Вставьте API-ключ в `src/main/resources/application.properties`.
3. В папке 'backend-java' выполните:
   - Windows: `mvnw.cmd spring-boot:run`
   - Linux/macOS: `./mvnw spring-boot:run`
4. В папке `frontend/` выполните:
   ```bash
   npm install && npm run dev
   ```
5. Сайт запустится на localhost:5173

## Требования

- **JDK 23+**
- **Node.js 18+** и **npm**
- **Maven** (или используйте Maven Wrapper `./mvnw` / `mvnw.cmd`, если он есть в проекте)

---

## 1. Настройка API-ключа нейросети

Перед запуском бэкенда откройте файл:

```
src/main/resources/application.properties
```

и укажите ваш API-ключ



## 2. Запуск бэкенда (Spring Boot)

Из корневой папки бэкенда backend-java/ выполните одну команду:

### Windows
```bash
mvnw.cmd spring-boot:run
```

### Linux / macOS
```bash
./mvnw spring-boot:run
```

Если Maven Wrapper отсутствует — используйте установленный Maven:

```bash
mvn spring-boot:run
```

После запуска сервер будет доступен по адресу `http://localhost:8080` (если в `application.properties` не указан другой порт).

---

## 3. Запуск фронтенда

Перейдите в папку с фронтендом frontend/ и выполните:

```bash
npm install
npm run dev
```

После запуска фронтенд будет доступен по адресу http://localhost:5173

---


### Про нейросеть
Важно! Опытным путём выяснили, что при использовании большинства апи необходимо использовать прокси, который нужно реализовать(либо используйте модели, доступные в России)