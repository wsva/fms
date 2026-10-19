import { IndexItem } from "@/components/IndexItem";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import HomePopup from '@/app/plan/home_popup';
import MottoPopup from '@/app/motto_popup';
import { getKey } from '@/app/actions/settings_general';

export default async function Home() {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const email = session?.user?.email || '';

    let showReminder = false;
    let motto = '';
    if (email) {
        const [reminderSetting, mottoValue] = await Promise.all([
            getKey('show_plan_reminder'),
            getKey('motto'),
        ]);
        if (reminderSetting !== null) showReminder = reminderSetting === 'true';
        if (mottoValue) motto = mottoValue;
    }

    return (
        <div>
            {showReminder && <HomePopup user_id={email} />}
            {motto && <MottoPopup motto={motto} />}
            <div className="container grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4">
                <IndexItem href='/listen/dictation' label='Listening'
                    description='Dictate cues from a dataset subtitle.'
                />
                <IndexItem href='/speak/read' label='Reading'
                    description='Read a book sentence by sentence.'
                />
                <div className="m-4 col-span-full"></div>

                <IndexItem href='/cards' label='Cards'
                    description='Review, tag and edit dataset flashcards.'
                />
                <div className="m-4 col-span-full"></div>

                <IndexItem href='/blog' label='Blog List'
                    description='View all blogs.'
                />
                <IndexItem href='/blog/add' label='New Blog'
                    description='Blog is for writings.'
                />
            </div>
        </div>
    );
}
