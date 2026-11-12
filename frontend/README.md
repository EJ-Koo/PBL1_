# STAREX frontend

확정된 화면 디자인 위에 사진 첨부, 기기 내 일기 저장, 메뉴 설정을 연결한 Expo 앱입니다.

- 일기 사진: 최대 5장 선택, 가로 스크롤 미리보기, 확대 및 첨부 제거. 모바일에서는 사진을 앱 문서 폴더로 복사하고 웹에서는 이미지 데이터를 저장합니다.
- 일기 본문·사진·공개할 그룹·작성 중인 내용·생성된 별·그룹·설정·코인은 앱을 다시 열어도 유지됩니다. 빈 일기는 제출할 수 없으며 저장 실패 시 입력 내용을 유지합니다.
- 메뉴에서 내용 또는 날짜로 저장한 일기를 찾을 수 있습니다. 배경음악 선택·끄기, 배경음/효과음 음량 조절, 테마 변경이 가능합니다. 소리는 첫 사용자 조작 후 재생되며 앱이 백그라운드로 이동하면 중지됩니다.
- 배경음악·테마·로그아웃·회원 탈퇴는 메뉴 안에서 아래로 펼쳐집니다. 각 항목을 독립적으로 열고 닫을 수 있으며 늘어난 내용은 세로로 스크롤할 수 있습니다.
- 회전 민감도는 25~200%로 조절하고 저장합니다. 기본 100%는 기존 회전 속도이며 개인·그룹 우주에 동일하게 적용합니다. 슬라이더에서는 가로 드래그로 값을 조절하고 세로 드래그로 메뉴를 스크롤합니다.
- 그룹 생성 팝업과 상점은 우주 배경·흰색 프레임·선형 아이콘을 공통으로 사용합니다. 상점에서 보유/적용 중/코인 부족/준비 중 상태를 구분합니다.
- 생성한 그룹은 일기 공유 범위에 바로 추가됩니다. 알약 버튼은 줄바꿈되며 키보드를 열어 둔 상태에서도 첫 터치로 선택됩니다. 여러 그룹을 선택할 수 있고 비공개를 누르면 모든 그룹 선택이 해제됩니다.
- 그룹 이름 옆에 멤버별 별을 표시합니다. 해당 그룹에 공유한 당일 일기가 있는 멤버의 별만 색이 채워지고, 중복 작성은 한 명으로 집계하며 다음 날 초기화됩니다. 그룹 API가 아직 없어 현재 그룹은 생성자 1명으로 시작합니다. `members` 및 일기의 `authorId`를 연결하면 여러 멤버의 상태를 같은 방식으로 표시합니다.
- 오늘의 퀘스트 완료 시 완료 배지·진행 바·5코인 지급 상태와 확인 버튼을 표시합니다. 미완료 시 일기 작성으로 이동하는 버튼을 제공합니다.
- 알림 토글은 기기 권한 확인 후 매일 기기 현지 시간 21:00에 일기 알림을 예약합니다. 끄면 예약을 취소합니다. 웹에서는 지원 안내를 표시합니다.
- 상점의 배경·혜성은 코인 차감 후 적용하며 이미 구매한 상품은 중복 차감하지 않습니다. 오늘 처음 일기를 쓰면 퀘스트 완료와 5코인을 반영합니다.

현재 데이터는 기기 안에 저장됩니다. 서버 사진 업로드, 다른 사용자와의 그룹 동기화, 로그인·로그아웃·회원 탈퇴는 아직 연결되지 않았습니다. 계정 메뉴와 프리즘(연속 출석 보호), 이용약관은 미연결 안내를 표시합니다.

`expo-image-picker`, `expo-audio`, `expo-notifications`, `expo-file-system`, AsyncStorage를 추가했습니다. 기존 개발용 앱을 사용하는 경우 네이티브 모듈과 플러그인을 반영하도록 개발 빌드를 다시 설치해야 합니다.

검증 명령:

```bash
npm test              # Node 22.6+의 TypeScript stripping 사용
npx tsc --noEmit
npm run lint
npx expo export --platform all
```

실기기에서는 사진 선택/취소/5장 제한/첨부 제거 후 재실행, 알림 권한 허용·거부 후 토글, 음량 0%·100%와 음악 끄기를 확인하세요. 자동 테스트는 일기·그룹·코인·검색·저장 데이터 검증 로직을 검사하며 OS 사진 선택창과 실제 알림 수신을 대신하지 않습니다.

## Expo starter reference

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
