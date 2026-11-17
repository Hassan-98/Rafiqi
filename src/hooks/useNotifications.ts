import { useCallback } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { notificationService } from '@/services/NotificationService';
import type { ModuleId } from '@/types';

export interface UseNotificationsResult {
  isAvailable: boolean;
  getConfig: (moduleId: ModuleId | string) => ReturnType<typeof useNotificationStore.getState>['configs'][string];
  setEnabled: (moduleId: ModuleId | string, enabled: boolean) => void;
  setTime: (moduleId: ModuleId | string, time: string) => void;
  schedule: (moduleId: ModuleId | string, prayerTime?: Date) => void;
  cancel: (moduleId: ModuleId | string) => void;
  scheduleAll: (prayerTimes?: Record<string, Date>) => void;
  cancelAll: () => void;
  requestPermission: () => void;
}

export function useNotifications(): UseNotificationsResult {
  const setConfig = useNotificationStore((s) => s.setConfig);
  const getConfig = useNotificationStore((s) => s.getConfig);
  const scheduleModule = useNotificationStore((s) => s.scheduleModule);
  const cancelModule = useNotificationStore((s) => s.cancelModule);
  const scheduleAll = useNotificationStore((s) => s.scheduleAll);
  const cancelAll = useNotificationStore((s) => s.cancelAll);

  const setEnabled = useCallback(
    (moduleId: ModuleId | string, enabled: boolean) => {
      setConfig(moduleId, { enabled });
      if (enabled) {
        scheduleModule(moduleId);
      } else {
        cancelModule(moduleId);
      }
    },
    [setConfig, scheduleModule, cancelModule],
  );

  const setTime = useCallback(
    (moduleId: ModuleId | string, time: string) => {
      setConfig(moduleId, { time });
      const config = getConfig(moduleId);
      if (config.enabled) {
        cancelModule(moduleId);
        scheduleModule(moduleId);
      }
    },
    [setConfig, getConfig, cancelModule, scheduleModule],
  );

  const requestPermission = useCallback(() => {
    notificationService.requestPermission();
  }, []);

  return {
    isAvailable: notificationService.isAvailable(),
    getConfig,
    setEnabled,
    setTime,
    schedule: scheduleModule,
    cancel: cancelModule,
    scheduleAll,
    cancelAll,
    requestPermission,
  };
}
