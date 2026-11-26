# STAREX frontend

확정된 화면 디자인 위에 사진 첨부, 기기 내 일기 저장, 메뉴 설정을 연결한 Expo 앱입니다.

- 일기 사진: 최대 5장 선택, 가로 스크롤 미리보기, 확대 및 첨부 제거. 모바일에서는 사진을 앱 문서 폴더로 복사하고 웹에서는 이미지 데이터를 저장합니다.
- 일기 본문·사진·공개할 그룹·작성 중인 내용·생성된 별·그룹·설정·코인은 앱을 다시 열어도 유지됩니다. 빈 일기는 제출할 수 없으며 저장 실패 시 입력 내용을 유지합니다.
- 메뉴에서 내용 또는 날짜로 저장한 일기를 찾을 수 있습니다. 배경음악 선택·끄기, 배경음/효과음 음량 조절, 테마 변경이 가능합니다. 소리는 첫 사용자 조작 후 재생되며 앱이 백그라운드로 이동하면 중지됩니다.
- 배경음악·테마·로그아웃·회원 탈퇴는 메뉴 안에서 아래로 펼쳐집니다. 각 항목을 독립적으로 열고 닫을 수 있으며 늘어난 내용은 세로로 스크롤할 수 있습니다.
- 회전 민감도는 25~200%로 조절하고 저장합니다. 기본 100%는 기존 회전 속도이며 개인·그룹 우주에 동일하게 적용합니다. 슬라이더에서는 가로 드래그로 값을 조절하고 세로 드래그로 메뉴를 스크롤합니다.
- 알림 토글은 기기 권한 확인 후 매일 기기 현지 시간 21:00에 일기 알림을 예약합니다. 끄면 예약을 취소합니다. 웹에서는 지원 안내를 표시합니다.
- 상점의 배경·혜성은 코인 차감 후 적용하며 이미 구매한 상품은 중복 차감하지 않습니다. 오늘 처음 일기를 쓰면 퀘스트 완료와 5코인을 반영합니다.

현재 데이터는 기기 안에 저장됩니다. 서버 사진 업로드, 다른 사용자와의 그룹 동기화, 로그인·로그아웃·회원 탈퇴는 아직 연결되지 않았습니다. 계정 메뉴와 프리즘(연속 출석 보호), 이용약관은 미연결 안내를 표시합니다.

`expo-image-picker`, `expo-audio`, `expo-notifications`, `expo-file-system`, AsyncStorage를 추가했습니다. 기존 개발용 앱을 사용하는 경우 네이티브 모듈과 플러그인을 반영하도록 개발 빌드를 다시 설치해야 합니다.

본문은 Orbitron Regular와 에스코어 드림 4 Regular, 강조는 Orbitron Bold와 에스코어 드림 6 Bold를 사용합니다. 영문과 숫자는 Orbitron, 한글은 에스코어 드림으로 표시합니다. iOS와 Android 10 이상에서 입력 중인 글자와 입력 안내에도 두 폰트를 함께 쓰려면 `modules/app-fonts`가 포함된 개발 빌드가 필요합니다.

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


## test UI 통합

- fffju a3b2a5e의 공용 프레임, 퀘스트, 메뉴 위치, 일기 반응형·키보드 대응, 그룹 생성창을 서버 기능과 결합했습니다. 그룹 이름은 24자로 제한합니다.
- 상점은 서버 상품·탭·구매·장착·행성 효과를 유지하고 공용 프레임을 사용합니다.
- 멤버 별은 확인된 당일 그룹 공유 일기의 최신 감정색으로 빛나며 파티클이 반짝입니다. 인원 상한은 고정하지 않고 줄바꿈합니다.
- 현재 일기 API는 본인 일기만 반환합니다. 다른 멤버의 출석을 추측하지 않으며 미확인 별은 흰색으로 표시합니다. 전체 작성 인원 집계는 서버 데이터 지원 전까지 표시하지 않습니다.
- fffju로의 프론트 전용 이식과 기능 분리는 후속 작업입니다.

## 연습용 튜토리얼

- 메뉴 → 계정관리 → **튜토리얼 다시 하기**에서 실행합니다. 이 기기에서 아직 체험하지 않은 계정은 메인 진입 후 자동 시작합니다. 알림으로 바로 그룹을 연 경우에는 메인으로 돌아온 뒤 시작합니다.
- 모든 단계에 **종료하기**가 있습니다. 웹 Escape와 Android 뒤로가기도 종료합니다. 종료/완료 후 자동으로 다시 열지 않으며, 메뉴에서 재시작하면 처음부터 체험합니다.
- 안내는 화면 정중앙의 반투명 팝업으로 겹쳐 표시하며 원래 UI를 밀지 않습니다. **다음**으로 설명을 넘기거나 접어 조작합니다. 접은 상태에서도 **설명 보기·다음·종료하기**를 사용할 수 있고, 새 단계에서는 설명이 다시 열립니다. 강조는 실제 버튼 프레임을 따라 표시합니다.
- 설명을 접었을 때의 조작 버튼은 하단 중앙 전용 영역에 표시합니다. 채팅·하단 메뉴와 겹치지 않도록 공간을 확보하며, 팝업을 열고 닫아도 우주 화면 위치가 바뀌지 않습니다.
- 연습 일기·사진·그룹·멤버·채팅은 메모리의 고정 예시만 사용합니다. 사진 추가는 번들 연습 사진을 붙이며 파일 선택·업로드·실제 DB 저장·코인 지급·푸시 발송을 하지 않습니다.
- 안내 문구·예시 글·임시 멤버는 `src/lib/tutorial.ts`, 화면은 `src/components/tutorial-universe.tsx`에서 수정합니다. 개인 별자리는 작성한 주제의 예시 4개와 내 일기 1개로 만들고, 그룹 별자리 예시는 기타 15개입니다. 연습 그룹 이름은 **용사**이며 그룹 공유에서는 앞서 쓴 글·사진·주제를 가져와 그룹 선택만 추가로 배웁니다.
- 계정별로 이 기기에 시작/종료/완료 상태만 저장합니다. 기기 간 완료 상태 동기화와 중간 단계 이어하기는 지원하지 않습니다. 실제 설정과 프로필은 연습 값으로 덮어쓰지 않습니다.
- 실제 그룹과 연습 그룹은 상단 프레임·돌아가기/모두 읽음/멤버 버튼·멤버 패널·채팅창 프레임 및 배치 계산을 공유합니다. 일기는 실제 별 말풍선으로 표시하되 연습용 반응 표시를 넘겨 하트 API를 호출하지 않습니다. 그룹 안의 하단 메뉴는 일기 작성 안내 단계에서만 연습용으로 표시합니다.
- 검증: `node --experimental-strip-types --test tests/tutorial*.test.mjs`와 전체 `npm test`, `npx tsc --noEmit`, `npx expo lint`. 실제 브라우저에서 글 입력 → 사진 생략/추가 → 주제 → 비공개/그룹 공유 → 별 읽기 → 모두 읽음 → 채팅 → 종료/재시작도 확인해주세요.
