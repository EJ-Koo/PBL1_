# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## UFO(민트) 커서

상점에서 50코인에 구매한 뒤 장착합니다. 구매·잔액·장착 상태는 기존 백엔드 API에 저장하며, 다른 커서와 같은 `cursor` 장비 칸을 사용합니다. 웹에서 마우스를 좌우로 움직이면 유영 이미지로 바뀌고, 클릭하면 최소 420ms 동안 빔을 표시합니다. 터치 입력에는 커서를 표시하지 않습니다.

상품 등록: 기존 `2026-11-07_shop_coins.sql`, `2026-11-19_cursor_items.sql`이 적용된 데이터베이스의 Supabase SQL Editor에서 [`2026-11-24_ufo_mint_cursor.sql`](../migrations/2026-11-24_ufo_mint_cursor.sql)을 실행합니다. 백엔드와 프런트엔드 배포도 필요합니다. 상품이 아직 등록되지 않았다면 구매 버튼은 비활성화됩니다.

세 PNG 원본은 `assets/images/cursors/ufo-mint-{idle,swim,beam}.png`에 있습니다. 커서 동작 테스트는 `node --test tests/ufo-cursor.test.mjs`로 실행합니다.
