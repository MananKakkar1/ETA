const PRIMARY_KEY = 'ElectronincTeachingAssistantMaterialID';
const DEFAULT_BASE_URL = 'http://localhost:3000';
const STORAGE_KEYS = {
  etaId: 'eta.primaryKey',
};

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).replace(
  /\/+$/,
  ''
);

function buildUrl(path, searchParams) {
  const target = path.startsWith('http')
    ? new URL(path)
    : new URL(`${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      target.searchParams.set(key, value);
    });
  }

  return target;
}

async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers,
    searchParams,
    credentials = 'include',
    responseType = 'json',
  } = options;

  const url = buildUrl(path, searchParams);
  const fetchOptions = {
    method,
    credentials,
    headers: new Headers(headers || {}),
  };

  if (!fetchOptions.headers.has('Accept')) {
    fetchOptions.headers.set('Accept', 'application/json');
  }

  if (body instanceof FormData) {
    fetchOptions.body = body;
  } else if (body !== undefined) {
    fetchOptions.headers.set('Content-Type', 'application/json');
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), fetchOptions);
  const failureClone = !response.ok ? response.clone() : null;
  let data = null;

  if (responseType === 'arrayBuffer') {
    data = await response.arrayBuffer();
  } else if (responseType === 'blob') {
    data = await response.blob();
  } else if (responseType === 'text') {
    data = await response.text();
  } else {
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
  }

  if (!response.ok) {
    let message =
      (typeof data === 'object' && data !== null && (data.error || data.message)) ||
      response.statusText;
    let details = data;

    if (
      (!message || typeof message !== 'string') &&
      failureClone &&
      responseType !== 'text'
    ) {
      try {
        const fallbackText = await failureClone.text();
        if (fallbackText) {
          message = fallbackText;
          details = fallbackText;
        }
      } catch {
        /* ignore fallback errors */
      }
    }

    const error = new Error(message);
    error.status = response.status;
    error.details = details;
    throw error;
  }

  return data;
}

export function storeEtaId(value) {
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      window.localStorage?.setItem(STORAGE_KEYS.etaId, value);
    } else {
      window.localStorage?.removeItem(STORAGE_KEYS.etaId);
    }
  } catch (error) {
    console.warn('Unable to persist etaId locally.', error);
  }
}

export function getStoredEtaId() {
  if (typeof window === 'undefined') return null;
  try {
    return (
      window.localStorage?.getItem(STORAGE_KEYS.etaId) ||
      window.sessionStorage?.getItem(STORAGE_KEYS.etaId) ||
      null
    );
  } catch {
    return null;
  }
}

export async function syncUserProfile({
  name,
  email,
  auth0Sub,
  etaId,
} = {}) {
  const payload = {
    name,
    email,
    auth0_sub: auth0Sub,
  };
  if (etaId) {
    payload.eta_id = etaId;
  }

  const data = await request('/user/sync', {
    method: 'POST',
    body: payload,
  });

  const resolvedEtaId =
    data?.eta_id ||
    data?.etaId ||
    data?.user?.[PRIMARY_KEY] ||
    etaId ||
    null;

  return {
    etaId: resolvedEtaId,
    uploadDate:
      data?.upload_date || data?.user?.UploadDate || data?.user?.uploadDate,
    user: data?.user || null,
  };
}

export async function fetchUser(etaId) {
  if (!etaId) {
    throw new Error('etaId is required');
  }
  return request(`/get-user/${etaId}`);
}

export async function createThread({ etaId, title } = {}) {
  if (!etaId) {
    throw new Error('etaId is required to create a thread.');
  }

  const body = {
    eta_id: etaId,
    title,
  };

  return request('/thread/create_chat_thread', {
    method: 'POST',
    body,
  });
}

export async function sendChatMessage({
  etaId,
  chatId,
  message,
  persona,
} = {}) {
  if (!etaId || !chatId || !message) {
    throw new Error('etaId, chatId, and message are required.');
  }

  const body = {
    eta_id: etaId,
    chatID: chatId,
    message,
    persona,
  };

  return request('/thread/add_message', {
    method: 'POST',
    body,
  });
}

export async function fetchThread({ etaId, chatId } = {}) {
  if (!etaId || !chatId) {
    throw new Error('etaId and chatId are required.');
  }

  return request('/thread/get_chat_thread/', {
    method: 'GET',
    searchParams: {
      etaId,
      chatId,
    },
  });
}

export async function generatePracticeProblems({
  etaId,
  chatId,
  message,
} = {}) {
  if (!etaId || !chatId) {
    throw new Error('etaId and chatId are required.');
  }

  const body = {
    eta_id: etaId,
    chatID: chatId,
    message,
  };

  return request('/generate-practice-problems', {
    method: 'POST',
    body,
  });
}

export async function generateWeeklyPlan({ etaId, chatId } = {}) {
  if (!etaId || !chatId) {
    throw new Error('etaId and chatId are required.');
  }

  const body = {
    eta_id: etaId,
    chatID: chatId,
  };

  return request('/generate-weekly-plan', {
    method: 'POST',
    body,
  });
}

export async function generateNotes({ etaId, chatId } = {}) {
  if (!etaId || !chatId) {
    throw new Error('etaId and chatId are required.');
  }

  const body = {
    eta_id: etaId,
    chatID: chatId,
  };

  return request('/generate-notes', {
    method: 'POST',
    body,
  });
}

export async function requestVoiceResponse({
  etaId,
  chatId,
  question,
  persona,
} = {}) {
  if (!etaId || !chatId) {
    throw new Error('etaId and chatId are required.');
  }
  if (!question) {
    throw new Error('question is required for voice synthesis.');
  }

  const url = buildUrl('/voice-response');
  const response = await fetch(url.toString(), {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      eta_id: etaId,
      chatID: chatId,
      question,
      persona,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    const error = new Error(message || response.statusText);
    error.status = response.status;
    throw error;
  }

  const audio = await response.arrayBuffer();
  return { audio, animation: response.headers.get('x-animation') || null };
}

export { STORAGE_KEYS };
