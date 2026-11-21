const CLIENT_ID = '79229390634-qis9s2qisp9fhgiunmimj9imr1s2c4fd.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const SYNC_FILE_NAME = 'routine_book_sync.json';

let tokenClient = null;
let accessToken = null;

// 1. Google OAuth 클라이언트 초기화
export function initGoogleAuth(onSuccess, onError) {
  if (!window.google || !window.google.accounts) {
    if (onError) onError('Google 인증 스크립트가 아직 로드되지 않았습니다.');
    return;
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      if (response.error) {
        if (onError) onError(response.error);
        return;
      }
      accessToken = response.access_token;
      if (onSuccess) onSuccess(accessToken);
    },
  });
}

// 2. 로그인 팝업 트리거
export function requestGoogleLogin() {
  if (!tokenClient) {
    alert('Google 인증 모듈 초기화 중입니다. 잠시 후 다시 클릭해주세요.');
    return;
  }
  tokenClient.requestAccessToken({ prompt: '' });
}

// 3. appDataFolder에서 동기화 파일 ID 조회
async function findSyncFileId() {
  const query = encodeURIComponent(`name='${SYNC_FILE_NAME}' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,modifiedTime)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) throw new Error('Drive 파일 목록 조회 실패');
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

// 4. Google Drive에서 데이터 불러오기 (Pull)
export async function pullFromGoogleDrive() {
  if (!accessToken) return null;
  const fileId = await findSyncFileId();
  if (!fileId) return null; // 최초 동기화 시 파일 없음

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Drive 데이터 다운로드 실패');
  return await res.json();
}

// 5. Google Drive에 데이터 저장하기 (Push)
export async function pushToGoogleDrive(payload) {
  if (!accessToken) return;
  const fileId = await findSyncFileId();

  const boundary = '-------routinebook_sync_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = fileId
    ? { name: SYNC_FILE_NAME }
    : { name: SYNC_FILE_NAME, parents: ['appDataFolder'] };

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }) +
    closeDelimiter;

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) throw new Error('Drive 데이터 업로드 실패');
}