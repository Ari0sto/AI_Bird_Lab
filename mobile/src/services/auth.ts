import { apiRequest } from './api';

export type LoginResponse = {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
};

export async function loginUser(
  email: string,
  password: string
): Promise<LoginResponse> {
  const response = await apiRequest(
    '/api/auth/login?useCookies=false',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }
  );

  if (response.status === 401) {
    throw new Error('Invalid email or password.');
  }

  if (!response.ok) {
    throw new Error(`Login failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as LoginResponse;

  if (!data.accessToken || !data.expiresIn) {
    throw new Error('Invalid authentication response.');
  }

  return data;
}

export async function checkUserToken(
  accessToken: string
): Promise<void> {
  const response = await apiRequest('/api/user/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `User authentication check failed: HTTP ${response.status}`
    );
  }
}