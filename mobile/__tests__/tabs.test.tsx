import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HomeScreen from '../src/app/(tabs)/index';
import StatisticsScreen from '../src/app/(tabs)/statistics';

const mockQuota = jest.fn();
const mockWallet = jest.fn();
const mockStats = jest.fn();
const mockSignOut = jest.fn();
const mockPush = jest.fn();
const mockAuthFetch = jest.fn();

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    session: { email: 'user@example.test' }, signOut: mockSignOut,
    authenticatedFetch: mockAuthFetch,
  }),
}));
jest.mock('../src/services/subscription', () => ({
  getAnalysisQuota: (...args: unknown[]) => mockQuota(...args),
  getWalletStatus: (...args: unknown[]) => mockWallet(...args),
}));
jest.mock('../src/services/birds', () => ({
  getStatistics: (...args: unknown[]) => mockStats(...args),
  percentage: (value: number | null) => value == null ? '—' : `${(value * 100).toFixed(1)}%`,
}));
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  mockQuota.mockReset().mockResolvedValue({
    freeLimit: 5, usedAttempts: 2, remainingAttempts: 3,
    reservedAttempts: 0, subscriptionActive: false,
  });
  mockWallet.mockReset().mockResolvedValue({ linked: false, walletAddress: null });
  mockStats.mockReset().mockResolvedValue({
    total: 3, max_confidence: 0.93, min_confidence: 0.43,
    frequent_species: [{ species: 'Common raven', count: 2 }],
  });
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockPush.mockReset();
  mockAuthFetch.mockReset();
});

describe('Mobile Home tab', () => {
  it('displays the free-attempt balance retrieved from Central Server', async () => {
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('3 of 5 free analyses remaining')).toBeTruthy());
    expect(screen.getByText('Free Plan')).toBeTruthy();
    expect(mockQuota).toHaveBeenCalledWith(mockAuthFetch);
  });

  it('shows unlimited access when the subscription is active', async () => {
    mockQuota.mockResolvedValue({
      freeLimit: 5, usedAttempts: 5, remainingAttempts: 0,
      reservedAttempts: 0, subscriptionActive: true,
    });
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Premium Active')).toBeTruthy());
    expect(screen.getByText('Unlimited photo and audio analysis')).toBeTruthy();
  });

  it('navigates to the analysis tab', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByText('Photo & Audio Analysis'));
    expect(mockPush).toHaveBeenCalledWith('/analyze');
  });
});

describe('Mobile Statistics tab', () => {
  it('displays total analyses, confidence, and species', async () => {
    await render(<StatisticsScreen />);
    await waitFor(() => expect(screen.getByText('Common raven')).toBeTruthy());
    expect(screen.getByText('93.0%')).toBeTruthy();
    expect(screen.getByText('43.0%')).toBeTruthy();
    expect(mockStats).toHaveBeenCalledWith(mockAuthFetch);
  });

  it('shows a useful error when the server is unavailable', async () => {
    mockStats.mockRejectedValue(new Error('Cannot load stats'));
    await render(<StatisticsScreen />);
    await waitFor(() => expect(screen.getByText('Cannot load stats')).toBeTruthy());
  });
});
