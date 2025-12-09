import { IndexItem } from "@/components/IndexItem";
import { auth } from '@/auth';
import PlanSimple from '@/app/plan/client_simple';

export default async function Home() {
    const session = await auth();
    const email = session?.user?.email || '';

    return (
        <div>
            {!!email && (
                <div className="flex flex-col m-2">
                    <PlanSimple user_id={email} />
                    <div className="m-4 col-span-full"></div>
                </div>
            )}
            <div className="container grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4">
                <IndexItem href='/listen/dictation' label='Dictation'
                    description='Upload audio and subtitle, and then do dictation.'
                />
                <IndexItem href='/listen/media' label='My Media'
                    description='View or edit media. Dictation.'
                />
                <div className="m-4 col-span-full"></div>

                <IndexItem href='/speak/practice' label='Practice'
                    description='Practice a sentence and share with others.'
                />
                <IndexItem href='/speak/read' label='Reading'
                    description='Read a book sentence by sentence.'
                />
                <IndexItem href='/speak/ask' label='Asking'
                    description='Ask and answer a question'
                />
                <div className="m-4 col-span-full"></div>

                <IndexItem href='/word/top' label='Top Words'
                    description='Top words ordered by frequency.'
                />
                <IndexItem href='/card/add?edit=y' label='New Card'
                    description='Card is for words, sentences or others.'
                />
                <IndexItem href='/card/my' label='My Cards'
                    description='View my cards.'
                />
                <IndexItem href='/card/test' label='Card Test'
                    description='Learn cards through tests and set familiarity.'
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
