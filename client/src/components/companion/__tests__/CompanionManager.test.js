import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { useSelector } from 'react-redux';
import { useIsElectron } from '../../../services/electronBridge';
import {
  detectCompanion,
  triggerMirrorSync,
  triggerCompanionInstall,
} from '../../../services/companion/companionClient';
import CompanionManager from '../CompanionManager';

jest.mock('react-redux', () => ({ useSelector: jest.fn() }));
jest.mock('../../../services/electronBridge', () => ({ useIsElectron: jest.fn() }));
jest.mock('../../../services/companion/companionClient', () => ({
  detectCompanion: jest.fn(),
  triggerMirrorSync: jest.fn(),
  triggerCompanionInstall: jest.fn(),
}));

describe('CompanionManager', () => {
  beforeEach(() => {
    useSelector.mockReturnValue(true);
    useIsElectron.mockReturnValue(false);
    jest.clearAllMocks();
  });

  test("ne propose ni ne lance l'installation au login lorsque le compagnon est absent", async () => {
    detectCompanion.mockResolvedValue(false);
    const { container } = render(<CompanionManager />);

    await waitFor(() => expect(detectCompanion).toHaveBeenCalledTimes(1));
    expect(triggerCompanionInstall).not.toHaveBeenCalled();
    expect(triggerMirrorSync).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  test('déclenche seulement le miroir silencieux quand le compagnon est présent', async () => {
    detectCompanion.mockResolvedValue(true);
    render(<CompanionManager />);

    await waitFor(() => expect(triggerMirrorSync).toHaveBeenCalledTimes(1));
    expect(triggerCompanionInstall).not.toHaveBeenCalled();
  });
});
