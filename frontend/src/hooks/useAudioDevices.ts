import { useState, useEffect, useCallback } from 'react';
import { ApiClient, CaptureCapabilities } from '../api/apiClient';
import { useTranslation } from '../i18n/i18n';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface AudioRouteStatus {
  ready_to_record: boolean;
  routing_active: boolean;
  auto_routing: boolean;
  physical_output?: string;
  missing?: string[];
}

export function useAudioDevices() {
  const { t } = useTranslation();

  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [systemDevices, setSystemDevices] = useState<AudioDevice[]>([]);
  const [selectedMicrophone, setSelectedMicrophone] = useState('');
  const [selectedSystemDevice, setSelectedSystemDevice] = useState('');
  const [audioRouteStatus, setAudioRouteStatus] = useState<AudioRouteStatus | null>(null);
  const [captureCapabilities, setCaptureCapabilities] = useState<CaptureCapabilities | null>(null);
  const [isTestRouted, setIsTestRouted] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const isAggregateInput = (label: string) => {
    const normalized = label.toLowerCase();
    return normalized.includes('aggregate') || normalized.includes('combinat') || normalized.includes('local asr input');
  };

  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput');

      const mics: AudioDevice[] = [];
      const sysDevices: AudioDevice[] = [];

      inputs.forEach((device, index) => {
        const label = device.label || t('recording.audioInputLabel', { index: index + 1 });
        const isBlackHole = label.toLowerCase().includes('blackhole');
        const isAggregate = isAggregateInput(label);

        if (isBlackHole) {
          sysDevices.push({ deviceId: device.deviceId, label });
        } else if (!isAggregate) {
          mics.push({ deviceId: device.deviceId, label });
        }
      });

      setMicrophones(mics);
      setSystemDevices(sysDevices);

      if (sysDevices.length > 0 && !selectedSystemDevice) {
        setSelectedSystemDevice(sysDevices[0].deviceId);
      }
    } catch (error) {
      console.warn('Unable to enumerate audio devices:', error);
    }
  }, [t, selectedSystemDevice]);

  const refreshAudioStatus = useCallback(async () => {
    try {
      const status = await ApiClient.getAudioRouteStatus();
      setAudioRouteStatus(status);
    } catch {
      setAudioRouteStatus(null);
    }
  }, []);

  const refreshCaptureCapabilities = useCallback(async () => {
    try {
      setCaptureCapabilities(await ApiClient.captureCapabilities());
    } catch {
      setCaptureCapabilities(null);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    refreshAudioStatus();
    refreshCaptureCapabilities();

    const handleDeviceChange = () => {
      loadDevices();
      refreshAudioStatus();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [loadDevices, refreshAudioStatus, refreshCaptureCapabilities]);

  return {
    microphones,
    systemDevices,
    selectedMicrophone,
    setSelectedMicrophone,
    selectedSystemDevice,
    setSelectedSystemDevice,
    audioRouteStatus,
    setAudioRouteStatus,
    captureCapabilities,
    setCaptureCapabilities,
    isTestRouted,
    setIsTestRouted,
    isVerifying,
    setIsVerifying,
    loadDevices,
    refreshAudioStatus,
    refreshCaptureCapabilities
  };
}
