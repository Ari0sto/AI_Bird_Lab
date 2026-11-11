import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import LoginScreen from '../src/app/login';
import RegisterScreen from '../src/app/register';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: mockSignUp }),
}));
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() } }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignUp.mockReset();
  mockPush.mockReset();
  mockBack.mockReset();
});

describe('Mobile sign-in screen', () => {
  it('rejects empty form without calling the API', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByText('Sign In'));
    expect(screen.getByText('Enter your email and password.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('submits credentials through AuthContext', async () => {
    mockSignIn.mockResolvedValue(undefined);
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'one@example.test');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'Test123!');
    await fireEvent.press(screen.getByText('Sign In'));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('one@example.test', 'Test123!'));
  });

  it('shows authentication failure to the user', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'));
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'one@example.test');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong');
    await fireEvent.press(screen.getByText('Sign In'));
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeTruthy());
  });

  it('navigates to account creation', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByText('No account? Create one'));
    expect(mockPush).toHaveBeenCalledWith('/register');
  });
});

describe('Mobile registration screen', () => {
  it('requires all registration fields', async () => {
    await render(<RegisterScreen />);
    await fireEvent.press(screen.getByText('Create Account'));
    expect(screen.getByText('Complete all fields.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('rejects mismatching passwords', async () => {
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'one@example.test');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'Test123!');
    await fireEvent.changeText(screen.getByPlaceholderText('Repeat password'), 'wrong');
    await fireEvent.press(screen.getByText('Create Account'));
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
  });

  it('submits a valid account', async () => {
    mockSignUp.mockResolvedValue(undefined);
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'one@example.test');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'Test123!');
    await fireEvent.changeText(screen.getByPlaceholderText('Repeat password'), 'Test123!');
    await fireEvent.press(screen.getByText('Create Account'));
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('one@example.test', 'Test123!'));
  });

  it('navigates back to login', async () => {
    await render(<RegisterScreen />);
    await fireEvent.press(screen.getByText('Already registered? Sign in'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
