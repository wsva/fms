'use client';

import LocalServiceSetting from './local_service';
import DefaultCardTagsSetting from './default_card_tags';
import ApiKeysSetting from './api_keys';
import ShowPlanReminderSetting from './show_plan_reminder';

export default function GeneralSettingsClient({ user_id }: { user_id: string }) {
    return (
        <div className="flex flex-col gap-4 py-6 px-4 md:px-0">
            <div className="border-b-2 border-sand-300 pb-4">
                <h1 className="text-2xl font-semibold text-sand-900">General</h1>
                <p className="text-sm text-foreground-500 mt-1">General settings</p>
            </div>

            <LocalServiceSetting />
            <ShowPlanReminderSetting />
            <DefaultCardTagsSetting user_id={user_id} />
            <ApiKeysSetting user_id={user_id} />
        </div>
    );
}
