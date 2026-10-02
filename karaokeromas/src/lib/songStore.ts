// BACKEND INTEGRATION POINT: Replace this in-memory store with Firebase Firestore
// Collection: 'songs' | Document fields match the Song interface below

export interface Song {
  id: string;
  title: string;
  artist: string;
  genre: string;
  youtubeUrl?: string;
  addedAt: string;
  status: 'processing' | 'ready' | 'demo';
  duration?: string;
  coverColor?: string;
}

// Mock library — replace with Firestore reads in future phases
export const mockSongs: Song[] = [
  {
    id: 'song-001',
    title: 'Evidências',
    artist: 'Chitãozinho & Xororó',
    genre: 'Sertanejo',
    addedAt: '2026-09-10',
    status: 'ready',
    duration: '4:12',
    coverColor: '#7c3aed',
  },
  {
    id: 'song-002',
    title: 'Como Nossos Pais',
    artist: 'Elis Regina',
    genre: 'MPB',
    addedAt: '2026-09-11',
    status: 'ready',
    duration: '3:58',
    coverColor: '#db2777',
  },
  {
    id: 'song-003',
    title: 'Garota de Ipanema',
    artist: 'Tom Jobim & Vinícius',
    genre: 'Bossa Nova',
    addedAt: '2026-09-12',
    status: 'ready',
    duration: '3:22',
    coverColor: '#0891b2',
  },
  {
    id: 'song-004',
    title: 'Asa Branca',
    artist: 'Luiz Gonzaga',
    genre: 'Forró',
    addedAt: '2026-09-13',
    status: 'ready',
    duration: '2:45',
    coverColor: '#d97706',
  },
  {
    id: 'song-005',
    title: 'Pais e Filhos',
    artist: 'Legião Urbana',
    genre: 'Rock Nacional',
    addedAt: '2026-09-14',
    status: 'ready',
    duration: '5:47',
    coverColor: '#16a34a',
  },
  {
    id: 'song-006',
    title: 'Eduardo e Mônica',
    artist: 'Legião Urbana',
    genre: 'Rock Nacional',
    addedAt: '2026-09-14',
    status: 'ready',
    duration: '4:31',
    coverColor: '#9333ea',
  },
  {
    id: 'song-007',
    title: 'Aquarela',
    artist: 'Toquinho',
    genre: 'MPB',
    addedAt: '2026-09-15',
    status: 'ready',
    duration: '3:19',
    coverColor: '#0284c7',
  },
  {
    id: 'song-008',
    title: 'Faroeste Caboclo',
    artist: 'Legião Urbana',
    genre: 'Rock Nacional',
    addedAt: '2026-09-15',
    status: 'ready',
    duration: '9:24',
    coverColor: '#b45309',
  },
];

export const genreOptions = [
  { value: 'sertanejo', label: 'Sertanejo', key: 'genre-sertanejo' },
  { value: 'mpb', label: 'MPB', key: 'genre-mpb' },
  { value: 'rock-nacional', label: 'Rock Nacional', key: 'genre-rock' },
  { value: 'bossa-nova', label: 'Bossa Nova', key: 'genre-bossa' },
  { value: 'forro', label: 'Forró', key: 'genre-forro' },
  { value: 'pagode', label: 'Pagode', key: 'genre-pagode' },
  { value: 'axe', label: 'Axé', key: 'genre-axe' },
  { value: 'funk', label: 'Funk', key: 'genre-funk' },
  { value: 'pop', label: 'Pop', key: 'genre-pop' },
  { value: 'gospel', label: 'Gospel', key: 'genre-gospel' },
  { value: 'outro', label: 'Outro', key: 'genre-outro' },
];

export const genreColorMap: Record<string, string> = {
  sertanejo: '#d97706',
  mpb: '#7c3aed',
  'rock-nacional': '#16a34a',
  'bossa-nova': '#0891b2',
  forro: '#dc2626',
  pagode: '#db2777',
  axe: '#ea580c',
  funk: '#9333ea',
  pop: '#0284c7',
  gospel: '#ca8a04',
  outro: '#52525b',
};

// Demo lyrics for the karaoke player (placeholder until AI processing is implemented)
export const demoLyrics = [
  { id: 'lyric-01', text: '♪ Bem-vindo ao Karaokê do Romas ♪', time: 0 },
  { id: 'lyric-02', text: 'Essa é uma letra de demonstração', time: 4 },
  { id: 'lyric-03', text: 'Aqui aparecerá a letra sincronizada da sua música', time: 8 },
  { id: 'lyric-04', text: 'Cada linha iluminada no momento certo', time: 12 },
  { id: 'lyric-05', text: 'Processamento de áudio por IA', time: 16 },
  { id: 'lyric-06', text: 'Será implementado em etapa futura', time: 20 },
  { id: 'lyric-07', text: 'Por enquanto, curta a interface do player', time: 24 },
  { id: 'lyric-08', text: 'Use os controles abaixo para testar', time: 28 },
  { id: 'lyric-09', text: 'Play, pause, avançar e volume', time: 32 },
  { id: 'lyric-10', text: 'Tudo preparado para sua noite de karaokê', time: 36 },
  { id: 'lyric-11', text: '♪ A letra real virá em breve ♪', time: 40 },
  { id: 'lyric-12', text: 'Adicione músicas usando o botão acima', time: 44 },
  { id: 'lyric-13', text: 'E em breve você poderá cantar junto', time: 48 },
  { id: 'lyric-14', text: 'Com a letra sincronizada automaticamente', time: 52 },
  { id: 'lyric-15', text: '♪ Karaokê do Romas ♪', time: 56 },
];