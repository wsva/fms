import { IndexItem } from "@/components/IndexItem";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import HomePopup from '@/app/plan/home_popup';
import { getKey } from '@/app/actions/settings_general';

export default async function Home() {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const email = session?.user?.email || '';

    let showReminder = false;
    if (email) {
        const [reminderSetting] = await Promise.all([
            getKey('show_plan_reminder'),
        ]);
        if (reminderSetting !== null) showReminder = reminderSetting === 'true';
    }

    return (
        <div>
            {showReminder && <HomePopup user_id={email} />}
            <div className="container grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4">
                <IndexItem href='/listen/media' label='Listening'
                    description='View or edit media. Dictation.'
                />
                <IndexItem href='/speak/read' label='Reading'
                    description='Read a book sentence by sentence.'
                />
                <div className="m-4 col-span-full"></div>

                <IndexItem href='/card/add?edit=y' label='New Card'
                    description='Card is for words, sentences or others.'
                />
                <IndexItem href='/card/test' label='Card Test'
                    description='Learn cards through tests and set familiarity.'
                />
                <div className="m-4 col-span-full"></div>

                <IndexItem href='/card/my' label='My Cards'
                    description='View my cards.'
                />
                <IndexItem href='/card/table' label='Cards Table'
                    description='View all cards as a table.'
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
