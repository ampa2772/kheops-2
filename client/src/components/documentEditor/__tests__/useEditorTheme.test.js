import { act, renderHook } from '@testing-library/react';
import useEditorTheme from '../useEditorTheme';

describe('préférences de thème de l’éditeur', () => {
  const original = window.matchMedia;
  let change;
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = jest.fn(() => ({ matches: false,
      addEventListener: (_, callback) => { change = callback; }, removeEventListener: jest.fn(),
    }));
  });
  afterAll(() => { window.matchMedia = original; });
  test('suit le système, mémorise le choix explicite et le conserve après réouverture', () => {
    const first = renderHook(useEditorTheme);
    expect(first.result.current.resolvedTheme).toBe('light');
    act(() => change({ matches: true }));
    expect(first.result.current.resolvedTheme).toBe('dark');
    act(() => first.result.current.chooseTheme('light'));
    expect(first.result.current.resolvedTheme).toBe('light');
    first.unmount();
    const reopened = renderHook(useEditorTheme);
    expect(reopened.result.current.theme).toBe('light');
    act(() => change({ matches: true }));
    expect(reopened.result.current.resolvedTheme).toBe('light');
  });
  test('ignore une préférence invalide et fonctionne sans media query disponible', () => {
    localStorage.setItem('kheops.editor.theme', 'invalid');
    window.matchMedia = undefined;
    const { result } = renderHook(useEditorTheme);
    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
  });
});
