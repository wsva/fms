import Client from './client';

// No session read here: every action resolves the caller from the session itself
// (`dataset_cards.ts::currentEmail`), and the dataset list is already filtered to
// what that caller may study, so an anonymous visitor just sees an empty grid.
export default function Page() {
    return <Client />
}
