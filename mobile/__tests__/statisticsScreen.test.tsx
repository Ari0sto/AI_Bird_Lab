import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import StatisticsScreen from '../src/app/(tabs)/statistics';
import { useAuth } from '../src/context/AuthContext';
import { getStatistics } from '../src/services/birds';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/services/birds', () => ({
  getStatistics: jest.fn(),
  percentage: (value: number | null) => value == null ? '—' : `${(value * 100).toFixed(1)}%`,
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const React = require('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top:0,bottom:0,left:0,right:0}),
}));

const mockStats=getStatistics as jest.Mock;
const fetcher=jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({authenticatedFetch:fetcher});
});

describe('Mobile statistics screen', () => {
  it('shows empty state when there are no analyses', async () => {
    mockStats.mockResolvedValue({total:0,max_confidence:null,min_confidence:null,frequent_species:[]});
    const ui=await render(<StatisticsScreen />);
    expect(await ui.findByText('There are no analyses yet.')).toBeTruthy();
    expect(mockStats).toHaveBeenCalledWith(fetcher);
  });
  it('renders received statistics and species names', async () => {
    mockStats.mockResolvedValue({total:3,max_confidence:0.95,min_confidence:0.5,frequent_species:[{species:'Raven',count:2},{species:'Sparrow',count:1}]});
    const ui=await render(<StatisticsScreen />);
    expect(await ui.findByText('Raven')).toBeTruthy();
    expect(ui.getByText('Sparrow')).toBeTruthy();
    expect(ui.getByText('95.0%')).toBeTruthy();
    expect(ui.getByText('50.0%')).toBeTruthy();
    expect(ui.getByText('3')).toBeTruthy();
  });
  it('displays service errors', async () => {
    mockStats.mockRejectedValueOnce(new Error('No connection'));
    const ui=await render(<StatisticsScreen />);
    expect(await ui.findByText('No connection')).toBeTruthy();
  });
  it('refreshes data on button press', async () => {
    mockStats.mockResolvedValue({total:0,max_confidence:null,min_confidence:null,frequent_species:[]});
    const ui=await render(<StatisticsScreen />);
    await ui.findByText('There are no analyses yet.');
    await fireEvent.press(ui.getByText('Refresh Statistics'));
    await waitFor(() => expect(mockStats).toHaveBeenCalledTimes(2));
  });
});
