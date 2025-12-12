import Client from './client';

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
};

export default async function Page({ searchParams }: Props) {
  const { word_id } = await searchParams;

  const word_id_str = word_id ? (typeof word_id === 'string' ? word_id : word_id[0]) : '';
  const word_id_int = parseInt(word_id_str)

  return (
    <Client word_id={word_id_int} />
  )
}
