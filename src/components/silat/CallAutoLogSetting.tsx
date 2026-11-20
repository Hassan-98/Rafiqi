import { useEffect, useState } from 'react';
import { Toggle } from '@/components/ui/Toggle';
import { useToastStore } from '@/store/toastStore';
import { callLogOn, importCallLog, openAppSettings, requestCallLog, setCallLogOn, silatPhoneCaps } from '@/services/silatPhone';

/**
 * «سجّل مكالماتي مع أرحامي تلقائياً» for the reminders sheet. Renders nothing
 * unless this build may read the call log (Android sideload flavor with the
 * SilatPhone plugin) — the play flavor, older APKs, web and desktop never see it.
 */
export function CallAutoLogSetting() {
  const [shown, setShown] = useState(false);
  const [on, setOn] = useState(callLogOn);

  useEffect(() => {
    void silatPhoneCaps().then((c) => {
      setShown(c.callLog);
      // Permission taken back in system settings → the switch shows off.
      if (!c.callLogGranted && callLogOn()) setCallLogOn(false);
      setOn(callLogOn());
    });
  }, []);

  if (!shown) return null;

  const change = async (v: boolean) => {
    if (v && !(await requestCallLog())) {
      useToastStore.getState().push({
        kind: 'info',
        title: 'لم يُمنح الإذن',
        body: 'اسمح بـ«سجل المكالمات» من إعدادات التطبيق ← الأذونات',
        durationMs: 6000,
        action: { label: 'الإعدادات', onPress: openAppSettings },
      });
      return;
    }
    setCallLogOn(v);
    setOn(v);
    if (v) void importCallLog();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-semibold text-text-primary dark:text-text-on-dark">سجّل مكالماتي مع أرحامي تلقائياً</span>
        <Toggle checked={on} onChange={(v) => void change(v)} label="سجّل مكالماتي مع أرحامي تلقائياً" hideLabel />
      </div>
      <p className="text-[12px] text-text-muted text-pretty">
        كل مكالمة صادرة أو واردة تزيد على ٢٠ ثانية مع رقمٍ محفوظ هنا تُسجَّل «اتصالاً» بمدّتها ويومها، وتستطيع التراجع عنها. لا يُقرأ من سجل المكالمات إلا أرقام من أضفتهم، ولا يُحفظ منه شيء غير ذلك.
      </p>
    </div>
  );
}
