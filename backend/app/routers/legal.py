from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["legal"])

PRIVACY_HTML = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>오늘의별일 개인정보처리방침</title>
<style>
  body { max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.7;
         font-family: -apple-system, system-ui, "Apple SD Gothic Neo", sans-serif; color: #1f1f33; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
  .updated { color: #666; font-size: .9rem; }
  a { color: #5b4bd6; }
</style>
</head>
<body>
<h1>오늘의별일 개인정보처리방침</h1>
<p class="updated">최종 업데이트: 2026-11-09</p>

<p>‘오늘의별일’(이하 “서비스”)은 이용자의 개인정보를 중요하게 생각하며,
아래와 같이 수집·이용·보관합니다.</p>

<h2>1. 수집하는 항목</h2>
<ul>
  <li>계정 정보: 이메일 주소 (이메일 가입 또는 Google 로그인 시), Google 계정의 프로필 이름</li>
  <li>이용자가 작성한 콘텐츠: 일기 내용, 첨부 사진</li>
  <li>서비스 이용 중 생성되는 데이터: 별·은하 시각화 정보, 감정 분석 결과</li>
</ul>

<h2>2. 이용 목적</h2>
<ul>
  <li>회원 인증 및 로그인</li>
  <li>일기 저장 및 별·은하 시각화 제공</li>
  <li>작성한 일기의 감정 분석(AI) 결과 제공</li>
</ul>

<h2>3. 보관 및 처리</h2>
<p>개인정보는 데이터베이스/인증 제공자(Supabase)와 서버 호스팅(Cloudtype) 환경에
저장·처리됩니다. Google 로그인은 Google의 인증 서비스를 통해 처리됩니다.
서비스는 이용자 데이터를 제3자에게 판매하지 않습니다.</p>

<h2>4. 보관 기간 및 삭제</h2>
<p>개인정보는 회원 탈퇴 또는 삭제 요청 시 지체 없이 파기합니다.
이용자는 언제든 본인 계정과 작성 콘텐츠의 삭제를 요청할 수 있습니다.</p>

<h2>5. 문의</h2>
<p>개인정보 관련 문의: <a href="mailto:wodnjsinjoy@gmail.com">wodnjsinjoy@gmail.com</a></p>
</body>
</html>"""


@router.get("/", response_class=HTMLResponse)
def landing():
    return (
        "<!doctype html><html lang='ko'><head><meta charset='utf-8'>"
        "<title>오늘의별일</title></head><body style='font-family:system-ui;"
        "max-width:560px;margin:60px auto;text-align:center'>"
        "<h1>오늘의별일</h1><p>기록할수록 커지는 나만의 우주</p>"
        "<p><a href='/privacy'>개인정보처리방침</a></p></body></html>"
    )


@router.get("/privacy", response_class=HTMLResponse)
def privacy():
    return PRIVACY_HTML
