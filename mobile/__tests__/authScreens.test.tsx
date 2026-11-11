import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import LoginScreen from '../src/app/login';
import RegisterScreen from '../src/app/register';
import { useAuth } from '../src/context/AuthContext';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({top:0,bottom:0,left:0,right:0}) }));

const mockedAuth=useAuth as jest.Mock;
const signIn=jest.fn();
const signUp=jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  signIn.mockResolvedValue(undefined);
  signUp.mockResolvedValue(undefined);
  mockedAuth.mockReturnValue({signIn,signUp});
});

describe('Mobile sign-in screen', () => {
  it('rejects empty credentials', async () => {
    const ui=await render(<LoginScreen />);
    await fireEvent.press(ui.getByText('Sign In'));
    expect(ui.getByText('Enter your email and password.')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });
  it('submits credentials to AuthContext', async () => {
    const ui=await render(<LoginScreen />);
    await fireEvent.changeText(ui.getByPlaceholderText('Email address'),'bird@example.com');
    await fireEvent.changeText(ui.getByPlaceholderText('Password'),'secret');
    await fireEvent.press(ui.getByText('Sign In'));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('bird@example.com','secret'));
  });
  it('renders sign-in errors', async () => {
    signIn.mockRejectedValueOnce(new Error('Invalid password'));
    const ui=await render(<LoginScreen />);
    await fireEvent.changeText(ui.getByPlaceholderText('Email address'),'bird@example.com');
    await fireEvent.changeText(ui.getByPlaceholderText('Password'),'bad');
    await fireEvent.press(ui.getByText('Sign In'));
    expect(await ui.findByText('Invalid password')).toBeTruthy();
  });
  it('navigates to registration', async () => {
    const ui=await render(<LoginScreen />);
    await fireEvent.press(ui.getByText('No account? Create one'));
    expect(router.push).toHaveBeenCalledWith('/register');
  });
});

describe('Mobile registration screen', () => {
  it('rejects incomplete fields', async () => {
    const ui=await render(<RegisterScreen />);
    await fireEvent.press(ui.getByText('Create Account'));
    expect(ui.getByText('Complete all fields.')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });
  it('rejects different passwords', async () => {
    const ui=await render(<RegisterScreen />);
    await fireEvent.changeText(ui.getByPlaceholderText('Email address'),'bird@example.com');
    await fireEvent.changeText(ui.getByPlaceholderText('Password'),'one');
    await fireEvent.changeText(ui.getByPlaceholderText('Repeat password'),'two');
    await fireEvent.press(ui.getByText('Create Account'));
    expect(ui.getByText('Passwords do not match.')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });
  it('calls signUp when passwords match', async () => {
    const ui=await render(<RegisterScreen />);
    await fireEvent.changeText(ui.getByPlaceholderText('Email address'),'bird@example.com');
    await fireEvent.changeText(ui.getByPlaceholderText('Password'),'secret');
    await fireEvent.changeText(ui.getByPlaceholderText('Repeat password'),'secret');
    await fireEvent.press(ui.getByText('Create Account'));
    await waitFor(() => expect(signUp).toHaveBeenCalledWith('bird@example.com','secret'));
  });
  it('shows registration errors', async () => {
    signUp.mockRejectedValueOnce(new Error('Email already registered'));
    const ui=await render(<RegisterScreen />);
    await fireEvent.changeText(ui.getByPlaceholderText('Email address'),'bird@example.com');
    await fireEvent.changeText(ui.getByPlaceholderText('Password'),'secret');
    await fireEvent.changeText(ui.getByPlaceholderText('Repeat password'),'secret');
    await fireEvent.press(ui.getByText('Create Account'));
    expect(await ui.findByText('Email already registered')).toBeTruthy();
  });
  it('returns to login', async () => {
    const ui=await render(<RegisterScreen />);
    await fireEvent.press(ui.getByText('Already registered? Sign in'));
    expect(router.back).toHaveBeenCalled();
  });
});
