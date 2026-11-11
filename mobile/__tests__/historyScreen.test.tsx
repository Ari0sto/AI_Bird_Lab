import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import HistoryScreen from '../src/app/(tabs)/history';
import { useAuth } from '../src/context/AuthContext';
import { deleteHistory, getHistory, getExportCsv } from '../src/services/birds';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/services/birds', () => ({
  getHistory: jest.fn(), deleteHistory: jest.fn(), getExportCsv: jest.fn(),
  percentage: (n: number | null) => n == null ? '—' : `${(n * 100).toFixed(1)}%`,
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const React = require('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('expo-file-system', () => ({
  File: class { uri='file:///cache/bird_analysis.csv'; write = jest.fn(); },
  Paths: {cache:'file:///cache'},
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top:0,bottom:0,left:0,right:0}),
}));

const mockHistory=getHistory as jest.Mock;
const mockDelete=deleteHistory as jest.Mock;
const mockExport=getExportCsv as jest.Mock;
const fetcher=jest.fn();
const record={
  id:5,image_name:'bird.png',predicted_species:'Raven',confidence:0.9,
  media_type:'image',analysis_date:'2026-11-10T10:00:00Z',description:'A raven',
};
beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({authenticatedFetch:fetcher});
  mockHistory.mockResolvedValue([]);
  mockDelete.mockResolvedValue(undefined);
  mockExport.mockResolvedValue('id,species\n5,Raven');
});

describe('Mobile history screen', () => {
  it('renders empty history', async () => {
    const ui=await render(<HistoryScreen />);
    expect(await ui.findByText('No analysis records found.')).toBeTruthy();
    expect(mockHistory).toHaveBeenCalledWith(fetcher,'');
  });
  it('renders analysis records with confidence and filename', async () => {
    mockHistory.mockResolvedValue([record]);
    const ui=await render(<HistoryScreen />);
    expect(await ui.findByText('Raven')).toBeTruthy();
    expect(ui.getByText('File: bird.png')).toBeTruthy();
    expect(ui.getByText('Confidence: 90.0%')).toBeTruthy();
    expect(ui.getByText('Record #5')).toBeTruthy();
  });
  it('searches by species', async () => {
    const ui=await render(<HistoryScreen />);
    await ui.findByText('No analysis records found.');
    await fireEvent.changeText(ui.getByPlaceholderText('Search by species'),'raven');
    await fireEvent.press(ui.getByText('Search'));
    await waitFor(() => expect(mockHistory).toHaveBeenCalledWith(fetcher,'raven'));
  });
  it('reports errors from the history service', async () => {
    mockHistory.mockRejectedValueOnce(new Error('History unavailable'));
    const ui=await render(<HistoryScreen />);
    expect(await ui.findByText('History unavailable')).toBeTruthy();
  });
  it('asks for confirmation before removing a record', async () => {
    mockHistory.mockResolvedValue([record]);
    const alert=jest.spyOn(Alert,'alert').mockImplementation(jest.fn());
    try {
      const ui=await render(<HistoryScreen />);
      await ui.findByText('Raven');
      await fireEvent.press(ui.getByText('Delete'));
      expect(alert).toHaveBeenCalled();
      const buttons=alert.mock.calls[0][2] as Array<{text:string,onPress?:() => void}>;
      const deleteButton=buttons.find(b => b.text==='Delete');
      expect(deleteButton).toBeDefined();
      deleteButton!.onPress!();
      await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(fetcher,5));
    } finally { alert.mockRestore(); }
  });
});
