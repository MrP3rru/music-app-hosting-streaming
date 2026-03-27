import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactPlayer from 'react-player'
import AudioMotionAnalyzer from 'audiomotion-analyzer'
import ElectricBorder from './ElectricBorder'
import { useListenTogether } from './useListenTogether'
import { soundJoin, soundLeave, soundPermission, soundSessionEnd, soundSwitchRadio, soundSwitchPlayer, soundStartup, soundStop, soundCreateSession, soundChatMsg, setUiVolume } from './sounds'
import UpdateModal from './UpdateModal'
import VersionPopup from './VersionPopup'
import { ref, onValue } from 'firebase/database'
import { db } from './firebase'
import { GameLobby } from './GameLobby'
import { MonopolyGame } from './MonopolyGame'
import { LyricsOverlay } from './LyricsOverlay'
import './App.css'

const genres = [
  {
    id: 'pl-hiphop',
    label: 'Polski hip-hop',
    preferredCountryCodes: ['PL'],
    radioQueries: [
      { countrycode: 'PL', tagList: 'hip-hop,rap' },
      { countrycode: 'PL', tagList: 'rap' },
      { countrycode: 'PL', tagList: 'hip hop' },
      { tagList: 'hip-hop,rap' },
      { name: 'hip hop' },
      { countrycode: 'PL', tagList: 'urban,rap' },
    ],
    seedQuery: 'polski hip hop official audio',
  },
  {
    id: 'usa-rap',
    label: 'Rap USA',
    preferredCountryCodes: ['US'],
    radioQueries: [
      { countrycode: 'US', tagList: 'hip-hop,rap,urban' },
      { countrycode: 'US', tagList: 'rap' },
      { countrycode: 'US', tagList: 'hip-hop' },
      { tagList: 'hip-hop,rap,urban' },
      { name: 'hip hop' },
      { countrycode: 'US', tagList: 'urban' },
    ],
    seedQuery: 'usa rap official audio',
  },
  {
    id: 'trap',
    label: 'Trap',
    radioQueries: [
      { tagList: 'trap,hip-hop,rap' },
      { tagList: 'trap,rap' },
      { tagList: 'trap' },
      { name: 'trap' },
      { tagList: 'hip-hop,rap' },
      { tagList: 'trap,electronic' },
    ],
    seedQuery: 'trap official audio',
  },
  {
    id: 'oldschool',
    label: 'Oldschool',
    radioQueries: [
      { tagList: 'old school hip hop,hip-hop,rap' },
      { tagList: 'oldschool,rap' },
      { name: 'old school' },
      { tagList: 'hip-hop,rap,funk' },
      { tagList: 'old school' },
      { tagList: '90s,hip-hop' },
    ],
    seedQuery: 'old school hip hop official audio',
  },
  {
    id: 'angielski-hiphop',
    label: 'Angielski hip-hop',
    preferredCountryCodes: ['GB', 'US'],
    radioQueries: [
      { countrycode: 'GB', tagList: 'hip-hop,rap,grime' },
      { countrycode: 'GB', tagList: 'hip-hop,rap' },
      { tagList: 'grime,uk,hip-hop' },
      { name: 'uk hip hop' },
      { tagList: 'british hip hop' },
      { countrycode: 'GB', tagList: 'rap' },
    ],
    seedQuery: 'uk hip hop official audio',
  },
  {
    id: 'techno',
    label: 'Techno',
    radioQueries: [
      { tagList: 'techno,electronic' },
      { tagList: 'techno' },
      { tagList: 'techno,house,dance' },
      { name: 'techno' },
      { tagList: 'industrial,techno' },
      { tagList: 'electronic,techno' },
    ],
    seedQuery: 'techno electronic official audio',
  },
  {
    id: 'dance',
    label: 'Dance/Electro',
    radioQueries: [
      { tagList: 'dance,electronic,house' },
      { tagList: 'dance' },
      { tagList: 'edm,electronic' },
      { name: 'dance' },
      { tagList: 'house,electronic' },
      { tagList: 'ibiza,dance' },
    ],
    seedQuery: 'dance electronic official audio',
  },
  {
    id: 'all',
    label: 'Wszystkie',
    radioQueries: [
      { countrycode: 'PL' },
      { countrycode: 'PL', tagList: 'pop,rap,hip-hop' },
      { tagList: 'hip-hop,rap' },
      { tagList: 'pop' },
      { tagList: 'dance,electronic' },
      { tagList: 'rock' },
      { name: 'radio' },
      { language: 'polish' },
      { language: 'english' },
    ],
    seedQuery: 'worldwide top songs official audio',
  },
]


const radioApiBases = [
  'https://de1.api.radio-browser.info',
  'https://fr1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
]//zmianiam2

const radioSearchEndpoint = '/json/stations/search'

// Ręcznie zweryfikowane polskie stacje z działającymi streamami
function _pl(id, name, tags, bitrate, urls, favicon = '', homepage = '', votes = 5000) {
  return { id: `curated-${id}`, name, countryCode: 'PL', country: 'Poland', codec: 'MP3', bitrate, tags, favicon, homepage, votes, lastSong: '', streamCandidates: urls, url: urls[0] }
}
const CURATED_PL_STATIONS = [
  // --- Główne ---
  _pl('rmffm',     'RMF FM',                 'pop,hits,polskie',       128, ['https://rs9-krk2.rmfstream.pl/RMFFM48','https://rs6-krk2.rmfstream.pl/RMFFM48','http://188.165.12.72:8000/rmf_fm'], 'https://www.rmf.fm/favicon.ico', 'https://www.rmf.fm', 9999),
  _pl('radiozet',  'Radio ZET',              'pop,hits,polskie',       128, ['https://n-4-6.dcs.redcdn.pl/sc/o2/Eurozet/live/audio.livx','https://n-1-6.dcs.redcdn.pl/sc/o2/Eurozet/live/audio.livx','http://91.121.179.221:8050'], 'https://www.radiozet.pl/favicon.ico', 'https://www.radiozet.pl', 9998),
  _pl('trojka',    'Polskie Radio Trójka',   'polskie,public,rock',    96,  ['https://mp3.polskieradio.pl:8904/','http://stream.polskieradio.pl/program3','https://stream3.polskieradio.pl:8954/'], 'https://www.polskieradio.pl/favicon.ico', 'https://trojka.polskieradio.pl', 9000),
  _pl('jedynka',   'Polskie Radio Jedynka',  'polskie,public,news',    96,  ['https://mp3.polskieradio.pl:8900/','http://stream.polskieradio.pl/program1','https://stream3.polskieradio.pl:8950/'], 'https://www.polskieradio.pl/favicon.ico', 'https://jedynka.polskieradio.pl', 8900),
  _pl('dwojka',    'Polskie Radio Dwójka',   'polskie,public,classical',96, ['https://mp3.polskieradio.pl:8902/','http://stream.polskieradio.pl/program2','https://stream3.polskieradio.pl:8952/'], 'https://www.polskieradio.pl/favicon.ico', 'https://dwojka.polskieradio.pl', 8800),
  _pl('czworka',   'Polskie Radio Czwórka',  'polskie,public,pop',     96,  ['https://mp3.polskieradio.pl:8906/','http://stream.polskieradio.pl/euro','https://stream3.polskieradio.pl:8956/'], 'https://www.polskieradio.pl/favicon.ico', 'https://czworka.polskieradio.pl', 8700),
  _pl('tokfm',     'TOK FM',                 'polskie,news,talk',      128, ['https://radiostream.pl/tuba10-1.mp3'], 'https://www.tokfm.pl/favicon.ico', 'https://www.tokfm.pl', 8500),
  _pl('antyradio', 'Antyradio',              'rock,polskie',           128, ['https://an03.cdn.eurozet.pl/ant-waw.mp3','https://an01.cdn.eurozet.pl/ant-waw.mp3'], 'https://www.antyradio.pl/favicon.ico', 'https://www.antyradio.pl', 8400),
  _pl('maryja',    'Radio Maryja',           'polskie,religious',       48, ['https://usa12.fastcast4u.com/proxy/isnesllc?mp=/1','https://radiomaryja.fastcast4u.com/proxy/radiomaryja'], 'https://www.radiomaryja.pl/favicon.ico', 'https://www.radiomaryja.pl', 8300),
  _pl('voxfm',     'VOX FM',                 'pop,polskie',            128, ['https://rs101-krk2.rmfstream.pl/VOXFM48','https://rs104-krk2.rmfstream.pl/VOXFM48'], '', 'https://www.voxfm.pl', 8200),
  // --- RMF podkanały ---
  _pl('rmfclassic',     'RMF Classic',           'classical,polskie',  48, ['https://rs201-krk-cyfrostat.rmfstream.pl/RMFCLASSIC48','http://188.165.12.72:8000/rmf_classic'], 'https://www.rmfclassic.pl/favicon.ico', 'https://www.rmfclassic.pl', 8600),
  _pl('rmfmaxxx',       'RMF MAXXX',             'dance,polskie',      48, ['https://rs101-krk.rmfstream.pl/RMFMAXXX48','http://188.165.12.72:8000/rmf_club'], 'https://www.rmfmaxxx.pl/favicon.ico', 'https://www.rmfmaxxx.pl', 8100),
  _pl('rmf-hiphop',     'RMF Hip Hop',           'hip-hop,rap',        48, ['http://188.165.12.72:8000/rmf_hip_hop'], '', 'https://www.rmf.fm', 6000),
  _pl('rmf-rock',       'RMF Rock',              'rock',               48, ['http://188.165.12.72:8000/rmf_rock'], '', 'https://www.rmf.fm', 6000),
  _pl('rmf-dance',      'RMF Dance',             'dance,electronic',   48, ['http://188.165.12.72:8000/rmf_dance'], '', 'https://www.rmf.fm', 6000),
  _pl('rmf-80s',        'RMF 80s',               '80s,retro',          48, ['http://188.165.12.72:8000/rmf_80s'], '', 'https://www.rmf.fm', 5800),
  _pl('rmf-90s',        'RMF 90s',               '90s,retro',          48, ['http://188.165.12.72:8000/rmf_90s'], '', 'https://www.rmf.fm', 5800),
  _pl('rmf-gold',       'RMF Gold',              'oldies,polskie',     48, ['http://188.165.12.72:8000/rmf_gold'], '', 'https://www.rmf.fm', 5700),
  _pl('rmf-chillout',   'RMF Chillout',          'chillout,ambient',   48, ['http://188.165.12.72:8000/rmf_chillout'], '', 'https://www.rmf.fm', 5600),
  _pl('rmf-polskie',    'RMF Polskie Przeboje',  'polskie,pop',        48, ['http://188.165.12.72:8000/rmf_polskie_przeboje'], '', 'https://www.rmf.fm', 5500),
  _pl('rmf-reggae',     'RMF Reggae',            'reggae',             48, ['http://188.165.12.72:8000/rmf_reggae'], '', 'https://www.rmf.fm', 5400),
  _pl('rmf-blues',      'RMF Blues',             'blues',              48, ['http://188.165.12.72:8000/rmf_blues'], '', 'https://www.rmf.fm', 5300),
  _pl('rmf-jazz',       'RMF Smooth Jazz',       'jazz',               48, ['http://188.165.12.72:8000/rmf_smooth_jazz'], '', 'https://www.rmf.fm', 5200),
  _pl('rmf-baby',       'RMF Baby',              'dzieci,polskie',     48, ['http://188.165.12.72:8000/rmf_baby'], '', 'https://www.rmf.fm', 5100),
  _pl('rmf-party',      'RMF Party',             'party,dance',        48, ['http://188.165.12.72:8000/rmf_party'], '', 'https://www.rmf.fm', 5000),
  // --- ZET podkanały ---
  _pl('zet-gold',       'Zet Gold',              'oldies,polskie',    128, ['http://zetgold-01.eurozet.pl:8000/'], '', 'https://www.radiozet.pl', 5800),
  _pl('zet-dance',      'Zet Dance',             'dance,electronic',  128, ['http://zetdance-01.eurozet.pl:8000/'], '', 'https://www.radiozet.pl', 5700),
  _pl('zet-rock',       'Zet Rock',              'rock',              128, ['http://zetrock-01.eurozet.pl:8000/'], '', 'https://www.radiozet.pl', 5600),
  _pl('zet-polskie',    'Zet Polskie',           'polskie,pop',       128, ['http://zetpl-02.eurozet.pl:8100/'], '', 'https://www.radiozet.pl', 5500),
  _pl('zet-slow',       'Zet Slow',              'ballads,polskie',   128, ['http://zet-slow-01.eurozet.pl:8200/'], '', 'https://www.radiozet.pl', 5400),
  _pl('zet-party',      'Zet Party',             'party,hits',        128, ['http://zetparty-01.eurozet.pl:8100/'], '', 'https://www.radiozet.pl', 5300),
  _pl('chillizet',      'Chilli ZET',            'pop,hits',          128, ['http://chillizetmp3-05.eurozet.pl:8400/'], '', 'https://www.radiozet.pl', 5200),
  _pl('zet-chopin',     'Zet Chopin',            'classical,chopin',  128, ['http://zetchopin-02.eurozet.pl:8100/'], '', 'https://www.radiozet.pl', 5100),
  _pl('zet-2000',       'Zet 2000',              '2000s,pop',         128, ['http://zet-2000-02.eurozet.pl:8100/'], '', 'https://www.radiozet.pl', 5000),
  _pl('zet-soul',       'Zet Soul',              'soul,rnb',          128, ['http://zetsoul-02.eurozet.pl:8100/'], '', 'https://www.radiozet.pl', 4900),
  _pl('zet-kids',       'Zet Kids',              'dzieci',            128, ['http://zetkids-02.eurozet.pl:8100/'], '', 'https://www.radiozet.pl', 4800),
  // --- Eska ---
  _pl('eskarock',       'Eska Rock',             'rock,polskie',      128, ['http://poznan5.radio.pionier.net.pl:8000/eskarock.mp3'], '', 'https://www.eskarock.pl', 6000),
  // --- Internetowe / niszowe ---
  _pl('radio357',       'Radio 357',             'pop,rock,polskie',  128, ['https://stream.radio357.pl','http://live.r357.eu','http://n16a-eu.rcs.revma.com/an1ugyygzk8uv'], '', 'https://radio357.pl', 9500),
  _pl('meloradio',      'Meloradio',             'pop,ballads',       128, ['https://ml02.cdn.eurozet.pl/mel-wro.mp3','https://ml.cdn.eurozet.pl/mel-net.mp3','https://ml03.cdn.eurozet.pl/mel-poz.mp3'], '', 'https://www.meloradio.pl', 8000),
  _pl('planetafm',      'Planeta FM',            'dance,clubbing',    128, ['http://planetamp3-01.eurozet.pl:8400/'], '', 'https://www.planetafm.pl', 7500),
  _pl('zlotempl',       'Radio Złote Przeboje',  'polskie,oldies',    128, ['http://poznan5-6.radio.pionier.net.pl:8000/tuba9-1.mp3'], '', '', 7000),
  // --- Polskastacja (tematyczne) ---
  _pl('ps-party',       'Polskastacja Party',    'party,dance',       128, ['http://91.121.124.91:8000/ps-party'], '', 'https://www.polskastacja.pl', 6500),
  _pl('ps-clubhits',    'Polskastacja Club Hits','clubbing,dance',    128, ['http://91.121.124.91:8000/ps-clubhits'], '', 'https://www.polskastacja.pl', 6400),
  _pl('ps-house',       'Polskastacja House',    'house,electronic',  128, ['http://91.121.124.91:8000/ps-house'], '', 'https://www.polskastacja.pl', 6300),
  _pl('ps-hiphop',      'Polskastacja Hip Hop',  'hip-hop,rap',       128, ['http://91.121.124.91:8000/ps-hiphop'], '', 'https://www.polskastacja.pl', 6200),
  _pl('ps-rock',        'Polskastacja Rock',     'rock',              128, ['http://91.121.124.91:8000/ps-rock'], '', 'https://www.polskastacja.pl', 6100),
  _pl('ps-polskie',     'Polskastacja Polskie',  'polskie,pop',       128, ['http://91.121.124.91:8000/ps-polskie'], '', 'https://www.polskastacja.pl', 6000),
  _pl('ps-relax',       'Polskastacja Relax',    'chillout,ambient',  128, ['http://91.121.124.91:8000/ps-relax'], '', 'https://www.polskastacja.pl', 5900),
  _pl('ps-decade80',    'Polskastacja Lata 80',  '80s,retro',         128, ['http://91.121.124.91:8000/ps-lata80'], '', 'https://www.polskastacja.pl', 5800),
  _pl('ps-decade90',    'Polskastacja Lata 90',  '90s,retro',         128, ['http://91.121.124.91:8000/ps-lata90'], '', 'https://www.polskastacja.pl', 5700),
  _pl('ps-metal',       'Polskastacja Metal',    'metal,heavy',       128, ['http://91.121.124.91:8000/ps-metal'], '', 'https://www.polskastacja.pl', 5600),
  _pl('ps-jazz',        'Polskastacja Jazz',     'jazz',              128, ['http://91.121.124.91:8000/ps-jazz'], '', 'https://www.polskastacja.pl', 5500),
  _pl('ps-classical',   'Polskastacja Klasyczna','classical',         128, ['http://91.121.124.91:8000/ps-klasyczna'], '', 'https://www.polskastacja.pl', 5400),
  _pl('ps-reggae',      'Polskastacja Reggae',   'reggae',            128, ['http://91.121.124.91:8000/ps-reggae'], '', 'https://www.polskastacja.pl', 5300),
  _pl('ps-disco',       'Polskastacja Disco',    'disco,dance',       128, ['http://91.121.124.91:8000/ps-disco'], '', 'https://www.polskastacja.pl', 5200),
  _pl('ps-discopolo',   'Polskastacja Disco Polo','discopolo,polskie',128, ['http://91.121.124.91:8000/ps-discopolo'], '', 'https://www.polskastacja.pl', 5100),
  // --- Regionalne ---
  _pl('radiokrakow',    'Radio Kraków',          'polskie,regional',   96, ['http://stream4.nadaje.com:9681/radiokrakow-s3'], '', 'https://www.radiokrakow.pl', 5000),
  _pl('radiolodz',      'Radio Łódź',            'polskie,regional',   96, ['https://stream.radiolodz.toya.cloud/RadioLodz-1.mp3'], '', '', 4900),
  _pl('radiogdansk',    'Radio Gdańsk',          'polskie,regional',   96, ['http://stream.task.gda.pl:8443/rg1'], '', '', 4800),
  _pl('radiopoznan',    'Radio Poznań',          'polskie,regional',   96, ['http://stream4.nadaje.com:8579/poznan'], '', '', 4700),
  _pl('radiokampus',    'Radio Kampus',          'polskie,alternative',96, ['http://193.0.98.66:8002/'], '', '', 4600),
]
const failedImageUrls = new Set()
const MIX_PATTERN = /\b(mix|mixtape|megamix|nonstop|non[ -]stop)\b/i
const LIVE_PATTERN = /\b(live|concert|show)\b/i
const COMPILATION_PATTERN = /\b(playlist|compilation|full album|full mixtape|dj set|type beat|best of|greatest hits|składanka|full ep|full lp|\d+\s*(songs?|tracks?|piosenek|hitów|utworów))\b/i
const NON_MUSIC_PATTERN = /\b(gameplay|game|review|tutorial|how[ -]to|vlog|trailer|interview|podcast|episode|unboxing|reaction|challenge|prank|documentary|film|movie|gotowanie|przepis|recenzja|zgadnij|quiz|po bicie|rozpoznaj|test wiedzy|który to|odgadnij|trivia|challenge|ranking top|top \d+|#\d)\b/i

const FILTER_TYPES = [
  { id: 'track', label: 'Utwór' },
  { id: 'mix', label: 'Mix / Mixtape' },
  { id: 'live', label: 'Live / Koncert' },
  { id: 'compilation', label: 'Składanka' },
]

const FILTER_LANGUAGES = [
  { id: 'pl', label: '🇵🇱 PL', query: 'polskie' },
  { id: 'en', label: '🇺🇸 EN', query: 'english' },
  { id: 'es', label: '🇪🇸 ES', query: 'español' },
  { id: 'fr', label: '🇫🇷 FR', query: 'français' },
  { id: 'de', label: '🇩🇪 DE', query: 'deutsch' },
  { id: 'it', label: '🇮🇹 IT', query: 'italiano' },
  { id: 'ru', label: '🇷🇺 RU', query: 'русский' },
]

const FILTER_GENRES = [
  { id: 'hiphop',     label: 'Hip-Hop',     query: 'hip-hop' },
  { id: 'rap',        label: 'Rap',          query: 'rap' },
  { id: 'trap',       label: 'Trap',         query: 'trap' },
  { id: 'drill',      label: 'Drill',        query: 'drill' },
  { id: 'pop',        label: 'Pop',          query: 'pop' },
  { id: 'rnb',        label: 'R&B / Soul',   query: 'r&b soul' },
  { id: 'discopolo',  label: 'Disco Polo',   query: 'disco polo' },
  { id: 'biesiadna',  label: 'Biesiadna',    query: 'muzyka biesiadna' },
  { id: 'rock',       label: 'Rock',         query: 'rock' },
  { id: 'metal',      label: 'Metal',        query: 'metal' },
  { id: 'edm',        label: 'EDM',          query: 'electronic dance music' },
  { id: 'reggae',     label: 'Reggae',       query: 'reggae' },
  { id: 'reggaeton',  label: 'Reggaeton',    query: 'reggaeton' },
  { id: 'jazz',       label: 'Jazz',         query: 'jazz' },
  { id: 'classical',  label: 'Klasyczna',    query: 'classical music' },
  { id: 'afrobeats',  label: 'Afrobeats',    query: 'afrobeats' },
]

const FILTER_ERAS = [
  { id: 'all',     label: 'Wszystkie' },
  { id: 'retro',   label: 'Lata 90.' },
  { id: 'classic', label: '2000–2010' },
  { id: 'tens',    label: '2010–2020' },
  { id: 'new',     label: 'Po 2020' },
]

const FILTER_DURATIONS = [
  { id: 'all',    label: 'Wszystkie' },
  { id: 'short',  label: 'Do 3 min',  max: 3 * 60 },
  { id: 'medium', label: '3–6 min',   min: 3 * 60, max: 6 * 60 },
  { id: 'long',   label: '6–12 min',  min: 6 * 60, max: 12 * 60 },
  { id: 'xlong',  label: '12+ min',   min: 12 * 60 },
]

const RADIO_GENRES = [
  { id: 'all',         label: 'Wszystkie' },
  { id: 'pop',         label: 'Pop',        tags: ['pop'] },
  { id: 'rock',        label: 'Rock',       tags: ['rock', 'alternative'] },
  { id: 'hiphop',      label: 'Hip-Hop',    tags: ['hip-hop', 'hiphop', 'rap', 'urban'] },
  { id: 'electronic',  label: 'Electronic', tags: ['electronic', 'dance', 'edm', 'techno', 'house', 'trance'] },
  { id: 'rnb',         label: 'R&B',        tags: ['rnb', 'r&b', 'soul', 'urban'] },
  { id: 'jazz',        label: 'Jazz',       tags: ['jazz', 'blues'] },
  { id: 'classical',   label: 'Klasyczna',  tags: ['classical', 'classic'] },
  { id: 'oldies',      label: 'Oldies',     tags: ['oldies', 'retro', '80s', '90s'] },
  { id: 'news',        label: 'Info / Talk', tags: ['news', 'talk', 'speech', 'information', 'informacje'] },
]

const DEFAULT_FILTERS = {
  types: ['track'],
  languages: [],
  genres: [],
  era: 'all',
  duration: 'all',
}

const ERA_DATE_RANGES = {
  retro:   { publishedAfter: '1990-01-01T00:00:00Z', publishedBefore: '2000-01-01T00:00:00Z' },
  classic: { publishedAfter: '2000-01-01T00:00:00Z', publishedBefore: '2010-01-01T00:00:00Z' },
  tens:    { publishedAfter: '2010-01-01T00:00:00Z', publishedBefore: '2020-01-01T00:00:00Z' },
  new:     { publishedAfter: '2021-01-01T00:00:00Z' },
}

function buildFilteredQuery(filters) {
  const parts = []

  if (filters.genres.length > 0) {
    parts.push(...filters.genres.map((id) => FILTER_GENRES.find((g) => g.id === id)?.query).filter(Boolean))
  }
  if (filters.languages.length > 0) {
    parts.push(...filters.languages.map((id) => FILTER_LANGUAGES.find((l) => l.id === id)?.query).filter(Boolean))
  }
  const hasPL = filters.languages.includes('pl')
  const isPolishGenre = ['discopolo', 'biesiadna'].some((g) => filters.genres.includes(g))
  if (hasPL && !isPolishGenre) parts.push('polskie')

  // Era keywords only for eras where API date filtering is less reliable
  if (filters.era === 'retro') parts.push('lata 90 oldschool retro classics')
  else if (filters.era === 'classic') parts.push('klasyki 2000s hits')
  else if (filters.era === 'tens') parts.push('2010s hits')
  // 'new' uses publishedAfter only — no keywords needed

  if (parts.length === 0) parts.push('muzyka')

  const isSpecificGenre = ['discopolo', 'biesiadna', 'classical', 'jazz', 'reggae'].some((g) => filters.genres.includes(g))
  const suffixes = isSpecificGenre
    ? ['piosenka', 'hit', 'najlepsze', '']
    : ['official audio', 'official video', 'single', 'lyric video']
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
  if (suffix) parts.push(suffix)

  return parts.join(' ')
}

function getEraDateRange(era) {
  return ERA_DATE_RANGES[era] || {}
}

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem('hiphop-player-trackfilters')
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) }
  } catch { return DEFAULT_FILTERS }
}

function applyFilters(items, filters) {
  return items.filter((item) => {
    if (!item?.title || !item?.id) return false
    const title = item.title
    const secs = item.seconds || 0
    if (secs > 90 * 60) return false

    const isMix = MIX_PATTERN.test(title)
    const isLive = LIVE_PATTERN.test(title)
    const isCompilation = COMPILATION_PATTERN.test(title)
    const isTrack = !isMix && !isLive && !isCompilation

    if (isTrack && !filters.types.includes('track')) return false
    if (isMix && !filters.types.includes('mix')) return false
    if (isLive && !filters.types.includes('live')) return false
    if (isCompilation && !filters.types.includes('compilation')) return false

    // Heurystyka: jeśli tryb tylko "utwór" i brak wyboru długości, odrzuć filmy >12min (prawdopodobne składanki bez tagu)
    const onlyTrack = filters.types.includes('track') && !filters.types.includes('compilation') && !filters.types.includes('mix')
    if (onlyTrack && filters.duration === 'all' && secs > 12 * 60) return false

    const dur = filters.duration
    if (dur === 'short'  && secs > 3 * 60) return false
    if (dur === 'medium' && secs > 0 && (secs < 3 * 60 || secs > 6 * 60)) return false
    if (dur === 'long'   && secs > 0 && (secs < 6 * 60 || secs > 12 * 60)) return false
    if (dur === 'xlong'  && secs > 0 && secs < 12 * 60) return false

    return true
  })
}

function buildRadioSearchUrl(base, query) {
  const params = new URLSearchParams({
    hidebroken: 'true',
    order: 'votes',
    reverse: 'true',
    ...query,
  })

  return `${base}${radioSearchEndpoint}?${params.toString()}`
}

async function fetchStationsFromMirrors(query) {
  for (const base of radioApiBases) {
    try {
      const response = await fetch(buildRadioSearchUrl(base, query))

      if (!response.ok) {
        continue
      }

      const data = await response.json()

      if (Array.isArray(data)) {
        return data
      }
    } catch {
      // Try next mirror.
    }
  }

  return []
}

function loadStoredFavorites() {
  const raw = localStorage.getItem('hiphop-player-favorites')

  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object' && item.key) : []
  } catch {
    return []
  }
}

function normalizeStation(station) {
  const streamCandidates = dedupeById(
    [station.urlResolved, station.url, station.url_resolved, station.url].filter(Boolean).map((url) => ({ id: url, url })),
  ).map((entry) => entry.url)

  return {
    id: station.stationuuid,
    name: station.name,
    country: station.country || 'Online',
    countryCode: station.countrycode || '',
    votes: Number(station.votes || 0),
    codec: station.codec,
    bitrate: station.bitrate,
    tags: station.tags,
    homepage: station.homepage,
    url: station.urlResolved || station.url,
    streamCandidates,
    favicon: station.favicon,
    lastSong: station.lastsong || '',
  }
}

function dedupeStations(items) {
  const map = new Map()

  for (const station of items) {
    const key = `${(station.name || '').trim().toLowerCase()}|${station.countryCode || ''}`
    const existing = map.get(key)

    if (!existing || station.votes > existing.votes) {
      map.set(key, station)
    }
  }

  return Array.from(map.values())
}

function normalizeStationFamilyName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b\d{2,3}\s*(kbps|k)\b/gi, ' ')
    .replace(/\b(aac|mp3|ogg|hls|stream)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sortStationsByFamily(items) {
  return [...items].sort((left, right) => {
    const leftFamily = normalizeStationFamilyName(left.name)
    const rightFamily = normalizeStationFamilyName(right.name)
    const familyCompare = leftFamily.localeCompare(rightFamily, 'pl')

    if (familyCompare !== 0) {
      return familyCompare
    }

    const votesCompare = (Number(right.votes) || 0) - (Number(left.votes) || 0)
    if (votesCompare !== 0) {
      return votesCompare
    }

    return (left.name || '').localeCompare(right.name || '', 'pl')
  })
}

function buildStationPlaybackCandidates(station, allStations) {
  if (!station) {
    return {
      entries: [],
      primaryCount: 0,
    }
  }

  const familyName = normalizeStationFamilyName(station.name)
  const primaryCandidates = (station.streamCandidates || []).slice(0, 3)
  const siblingStations = allStations
    .filter((entry) => entry.id !== station.id)
    .filter((entry) => normalizeStationFamilyName(entry.name) === familyName)
    .filter((entry) => !station.countryCode || entry.countryCode === station.countryCode)
    .sort((left, right) => {
      const leftHas128 = /\b128\b|128kbps/i.test(left.name || '')
      const rightHas128 = /\b128\b|128kbps/i.test(right.name || '')

      if (leftHas128 !== rightHas128) {
        return rightHas128 ? 1 : -1
      }

      const bitrateCompare = (Number(right.bitrate) || 0) - (Number(left.bitrate) || 0)
      if (bitrateCompare !== 0) {
        return bitrateCompare
      }

      return (Number(right.votes) || 0) - (Number(left.votes) || 0)
    })

  return {
    entries: dedupeById(
      [
        ...(primaryCandidates.map((url) => ({ id: url, url, label: station.name, isPrimary: true }))),
        ...siblingStations.flatMap((entry) =>
          (entry.streamCandidates || []).map((url) => ({
            id: url,
            url,
            label: entry.name,
            isPrimary: false,
          })),
        ),
      ],
    ),
    primaryCount: primaryCandidates.length,
  }
}

function pickPreferredStation(stations, previousStation) {
  if (previousStation?.id) {
    const same = stations.find((station) => station.id === previousStation.id)
    if (same) {
      return same
    }
  }

  const vibe = stations.find((station) => station.name?.toLowerCase().includes('vibefm'))
  if (vibe) {
    return vibe
  }

  return stations[0] ?? null
}

function dedupeById(items) {
  return items.filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index)
}

function filterPlayableTracks(items) {
  return items.filter((item) => {
    if (!item?.title || !item?.id) return false
    if (item.seconds > 0 && item.seconds < 75) return false
    if (item.seconds > 90 * 60) return false
    if (NON_MUSIC_PATTERN.test(item.title)) return false
    return true
  })
}

function spreadByAuthor(tracks) {
  if (tracks.length <= 2) return tracks
  const byAuthor = new Map()
  for (const t of tracks) {
    const key = (t.author || '').toLowerCase().trim()
    if (!byAuthor.has(key)) byAuthor.set(key, [])
    byAuthor.get(key).push(t)
  }
  const queues = shuffleArray(Array.from(byAuthor.values()))
  const result = []
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      if (q.length > 0) result.push(q.shift())
    }
  }
  return result
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('hiphop-player-history')
    if (!raw) return []
    const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000
    return JSON.parse(raw).filter((e) => e?.ts > cutoff && e?.track?.id)
  } catch { return [] }
}

function saveHistory(entries) {
  try {
    localStorage.setItem('hiphop-player-history', JSON.stringify(entries.slice(0, 40)))
  } catch {}
}

function countryFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) {
    return 'FM'
  }

  return countryCode
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('')
}

function formatSeconds(value) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  const minutes = Math.floor(safeValue / 60)
  const seconds = safeValue % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * 
 * 
 * 
 *
 * @param {number} percent - Głośność w procentach (0-100)
 * @param {'linear'|'sqrt'|'square'} [curve='linear'] - Typ krzywej regulacji
 * @returns {number} - Wartość głośności (0-1)
 */
function toEffectiveVolume(percent, curve = 'linear') {
  const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  if (safePercent === 0) return 0;
  const normalized = safePercent / 100;
  switch (curve) {
    case 'square': return normalized * normalized;
    case 'sqrt':   return Math.sqrt(normalized);
    // Logarytmiczna krzywa audio: 0%→0, 1%≈-40dB, 50%≈-20dB, 75%≈-10dB, 100%→0dB
    // Naturalna dla ucha — pokrywa pełen zakres dynamiki bez "głośnego" minimum
    case 'log':    return Math.pow(10, 2 * (normalized - 1));
    case 'linear':
    default:       return normalized;
  }
}

function extractYoutubeId(url) {
  try {
    const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    return m ? m[1] : null
  } catch { return null }
}

function extractYoutubePlaylistId(url) {
  try {
    const m = url.match(/[?&]list=([a-zA-Z0-9_-]+)/)
    return m ? m[1] : null
  } catch { return null }
}

function renderChatText(text) {
  if (!text) return null
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  const nodes = []
  let previewAdded = false
  parts.forEach((part, i) => {
    if (/^https?:\/\//.test(part)) {
      const ytId = extractYoutubeId(part)
      nodes.push(
        <a key={i} href={part} className="chat-link" target="_blank" rel="noreferrer">
          {part}
        </a>
      )
      if (ytId && !previewAdded) {
        previewAdded = true
        nodes.push(
          <div key={`yt-${i}`} className="chat-link-preview">
            <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" className="chat-preview-thumb" draggable={false} />
            <span className="chat-preview-label">▶ YouTube</span>
          </div>
        )
      }
    } else if (part) {
      nodes.push(part)
    }
  })
  return nodes
}

function buildFavoriteEntry(type, item, genreId) {
  return {
    key: `${type}:${item.id}`,
    type,
    genreId,
    item,
  }
}

function getPlaceholderArt(label, type) {
  const safeLabel = encodeURIComponent((label || (type === 'radio' ? 'Radio' : 'Track')).slice(0, 18))
  const palette = type === 'radio' ? '11243b/ff9f68' : '1c1d3c/ffd36e'
  return `https://placehold.co/320x320/${palette}?text=${safeLabel}`
}

function withFallbackArt(event, label, type) {
  const target = event.currentTarget
  const failed = target.src
  if (failed && !failed.startsWith('https://placehold.co')) {
    failedImageUrls.add(failed)
  }
  target.onerror = null
  target.src = getPlaceholderArt(label, type)
}

function safeArt(url, label, type) {
  if (!url || failedImageUrls.has(url)) return getPlaceholderArt(label, type)
  return url
}

function shuffleArray(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Statyczne dane dla idle wave — kształt łuku sinusoidalnego
const IDLE_BARS = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47
  return Math.round(12 + Math.sin(t * Math.PI) * 58 + Math.sin(t * Math.PI * 3) * 10)
})

const CHAT_COMMANDS = [
  { cmd: '/next',   desc: 'Następny utwór/stacja',          argHint: '',                role: 'mod' },
  { cmd: '/stop',   desc: 'Zatrzymaj odtwarzanie',          argHint: '',                role: 'mod' },
  { cmd: '/pause',  desc: 'Pauza',                          argHint: '',                role: 'mod' },
  { cmd: '/play',   desc: 'Wznów odtwarzanie',              argHint: '',                role: 'mod' },
  { cmd: '/mute',   desc: 'Wycisz użytkownika',             argHint: '[nick] [sek=30]', role: 'host' },
  { cmd: '/unmute', desc: 'Odcisz użytkownika',             argHint: '[nick]',          role: 'host' },
  { cmd: '/clear',  desc: 'Wyczyść czat',                   argHint: '',                role: 'host' },
  { cmd: '/me',     desc: 'Akcja/emote',                    argHint: '[tekst]',         role: 'mod' },
  { cmd: '/msg',    desc: 'Prywatna wiadomość',             argHint: '[nick] [tekst]',  role: 'all' },
  { cmd: '/r',      desc: 'Odpowiedz na ostatni PM',        argHint: '[tekst]',         role: 'all' },
  { cmd: '/vol',    desc: 'Ustaw głośność',                 argHint: '[0-100]',         role: 'all' },
  { cmd: '/queue',  desc: 'Pokaż kolejkę',                  argHint: '',                role: 'all' },
  { cmd: '/sys',    desc: 'Wł/Wył wiadomości systemowe',   argHint: '',                role: 'all' },
  { cmd: '/help',   desc: 'Lista komend',                   argHint: '',                role: 'all' },
]

function App() {
  const ZOOM_LEVELS = Array.from({ length: 31 }, (_, i) => Math.round((0.70 + i * 0.02) * 100) / 100)
  const ZOOM_LABELS = ZOOM_LEVELS.map(f => `${Math.round(f * 100)}%`)
  const ZOOM_NAMES  = ZOOM_LEVELS.map((f, i) => {
    const pct = Math.round(f * 100)
    const w   = Math.round(1460 * f)
    const h   = Math.round(940  * f)
    return i === 16 ? `102% — Normalne (${w} × ${h})` : `${pct}% — ${w} × ${h}`
  })
  const [zoomIdx, setZoomIdx] = useState(16)
  const [pendingZoom, setPendingZoom] = useState(null) // wybrany ale nie zapisany
  const [showSizePanel, setShowSizePanel] = useState(false)

  const [appVersion, setAppVersion] = useState('')
  const [versionHistory, setVersionHistory] = useState([])
  const [versionPopupOpen, setVersionPopupOpen] = useState(false)
  const [radioGardenMode, setRadioGardenMode] = useState(false)
  const [rgResults, setRgResults] = useState([])
  const [rgLoading, setRgLoading] = useState(false)
  const [rgCountry, setRgCountry] = useState('')
  const [rgLoadingId] = useState(null)
  const rgDebounceRef = useRef(null)
  const [updateInfo, setUpdateInfo] = useState(null) // null | { hasUpdate, newVersion, changelog }

  useEffect(() => {
    window.playerBridge?.getVersion?.().then(v => {
      if (v?.version) { setAppVersion(v.version); setVersionHistory(v.history || []) }
    })
    // Dźwięk startowy po chwili (żeby AudioContext mógł się zainicjować)
    const startSound = setTimeout(() => soundStartup(), 800)
    // Sprawdź aktualizacje 3s po starcie (nie blokuj ładowania UI)
    const t = setTimeout(() => {
      window.playerBridge?.checkUpdate?.().then(info => {
        if (info?.hasUpdate) setUpdateInfo(info)
      }).catch(() => {})
    }, 3000)
    return () => { clearTimeout(t); clearTimeout(startSound) }
  }, [])

  const [splashVisible, setSplashVisible] = useState(true)
  const [splashFading, setSplashFading] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setSplashFading(true), 1800)
    const t2 = setTimeout(() => setSplashVisible(false), 2600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Przywracanie trybu i podgatunku playera z localStorage
  const [mode, setMode] = useState(() => localStorage.getItem('hiphop-player-mode') || 'radio')
  // Przywracanie wybranego gatunku i widoku biblioteki z localStorage
  const [genreId, setGenreId] = useState(() => localStorage.getItem('hiphop-player-genre') || genres[0].id)
  const [libraryView, setLibraryView] = useState(() => localStorage.getItem('hiphop-player-libraryview') || 'all')
  const [chatInput, setChatInput] = useState('')
  const [chatUnread, setChatUnread] = useState(0)
  const chatEndRef = useRef(null)
  const [cmdSuggestions, setCmdSuggestions] = useState([])
  const [cmdSuggestIdx, setCmdSuggestIdx] = useState(0)
  const cmdListRef = useRef(null)
  const lastPmSenderRef = useRef(null)
    // Zapisuj wybrany gatunek do localStorage przy każdej zmianie
    useEffect(() => {
      localStorage.setItem('hiphop-player-genre', genreId)
    }, [genreId])

    // Zapisuj widok biblioteki do localStorage przy każdej zmianie
    useEffect(() => {
      localStorage.setItem('hiphop-player-libraryview', libraryView)
    }, [libraryView])

  // Przywracanie filtra kraju i frazy wyszukiwania stacji z localStorage
  const [countryFilter, setCountryFilter] = useState('PL')
  const [radioTagFilter, setRadioTagFilter] = useState('hiphop')
  const [stationSearchTerm, setStationSearchTerm] = useState(() => localStorage.getItem('hiphop-player-stationsearch') || '')
  const [visibleStationCount, setVisibleStationCount] = useState(40)
  const stationListSentinelRef = useRef(null)
  const [visibleTrackCount, setVisibleTrackCount] = useState(40)
  const trackListSentinelRef = useRef(null)
  const [filters, setFilters] = useState(loadSavedFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [curatedTracksKey, setCuratedTracksKey] = useState(0)
  const filtersRef = useRef(filters)
  useEffect(() => { filtersRef.current = filters }, [filters])
  const [stations, setStations] = useState([])
  const [countryBoostStations, setCountryBoostStations] = useState([])
  const [radioLoading, setRadioLoading] = useState(false)
  const [radioError, setRadioError] = useState('')
  const [currentStation, setCurrentStation] = useState(null)
  const [stationStreams, setStationStreams] = useState([])
  const [stationStreamIndex, setStationStreamIndex] = useState(0)
  const [primaryStationStreamCount, setPrimaryStationStreamCount] = useState(0)
  const [isSwitchingStationStream, setIsSwitchingStationStream] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [curatedTracks, setCuratedTracks] = useState([])
  const [trackLoading, setTrackLoading] = useState(false)
  const [trackError, setTrackError] = useState('')
  const [currentTrack, setCurrentTrack] = useState(null)
  const [isRadioPlaying, setIsRadioPlaying] = useState(false)
  const [isRadioBuffering, setIsRadioBuffering] = useState(false)
  const [isTrackPlaying, setIsTrackPlaying] = useState(false)
  const [isTrackReady, setIsTrackReady] = useState(false)
  const [resolvedTrackUrl, setResolvedTrackUrl] = useState(null)
  const [sessionEndedMsg, setSessionEndedMsg] = useState(null)
  const [radioNowPlaying, setRadioNowPlaying] = useState('')
  const [radioNowPlayingAt, setRadioNowPlayingAt] = useState(null)
  const [radioPlayHistory, setRadioPlayHistory] = useState([])
  const prevRadioNowPlayingRef = useRef('')
  const [trackDuration, setTrackDuration] = useState(0)
  const [trackTime, setTrackTime] = useState(0)
  const trackTimeRef = useRef(0)
  const pendingRemoteSeekRef = useRef(null)
  const [isSeeking, setIsSeeking] = useState(false)
  const isSeekingRef = useRef(false)
  const [sessionModalOpen, setSessionModalOpen] = useState(false)
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [myNickname, setMyNickname] = useState(() => localStorage.getItem('together-nickname') || '')
  const [sessionToast, setSessionToast] = useState('')
  const sessionToastTimerRef = useRef(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const codeCopiedTimerRef = useRef(null)
  const [suggestedIds, setSuggestedIds] = useState(new Set())
  const [similarItems, setSimilarItems] = useState([])
  const [similarLoading, setSimilarLoading] = useState(false)
  const [refreshSimilarTrigger, setRefreshSimilarTrigger] = useState(0)
  const lastSimilarQueueLengthRef = useRef(0)
  const [gameLobbyOpen, setGameLobbyOpen] = useState(false)
  const [gameState, setGameState] = useState('waiting') // 'waiting' | 'playing'
  const [lyricsVisible, setLyricsVisible] = useState(false)
  const [lyricsOffset,  setLyricsOffset]  = useState(0)
  const [monopolyOpen, setMonopolyOpen] = useState(false)
  const [monopolyPlayers, setMonopolyPlayers] = useState([])
  const [monopolyDuration, setMonopolyDuration] = useState(7200)
  const monopolyAutoOpenedRef = useRef(false)

  // Refs do bezpośrednich aktualizacji DOM podczas przeciągania (bez re-renderu)
  const volumeFillRef = useRef(null)
  const volumeThumbRef = useRef(null)
  const volumeLabelRef = useRef(null)
  const pendingVolumeRef = useRef(null)
  const lastVolumeBeforeMuteRef = useRef(35)
  const seekFillRef = useRef(null)
  const seekThumbRef = useRef(null)
  const seekTimeDisplayRef = useRef(null)
  const seekValueRef = useRef(null)

  const [loadingMoreTracks, setLoadingMoreTracks] = useState(false)
  const [previousTracks, setPreviousTracks] = useState([])
  const [trackHistory, setTrackHistory] = useState(loadHistory)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [localQueue, setLocalQueue] = useState([])
  const localQueueRef = useRef([])
  const activeTrackRef = useRef(null)
  const preloadedForRef = useRef(null)
  const [activeTrackQuery, setActiveTrackQuery] = useState('')
  // Inicjalizacja volumePercent z localStorage lub domyślnie 35
  const [volumePercent, setVolumePercent] = useState(() => {
    const stored = localStorage.getItem('hiphop-player-volume')
    const parsed = Number(stored)
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 35
  })
  // Inicjalizacja currentStation z localStorage jeśli istnieje
  const [favorites, setFavorites] = useState(loadStoredFavorites)
  // Przywracanie ostatniej stacji po starcie aplikacji

  useEffect(() => {
    const storedStation = localStorage.getItem('hiphop-player-last-station')
    if (storedStation) {
      try {
        const parsed = JSON.parse(storedStation)
        if (parsed && parsed.id) {
          setCurrentStation(parsed)
          // Ustaw od razu streamy i indeks, jeśli stacje są już załadowane
          setTimeout(() => {
            setStations((prevStations) => {
              const plan = buildStationPlaybackCandidates(parsed, prevStations)
              setStationStreams(plan.entries)
              setStationStreamIndex(0)
              setPrimaryStationStreamCount(plan.primaryCount)

              return prevStations
            })
          }, 0)
        }
      } catch {}
    }
  }, [])


  const audioRef = useRef(null)
  const trackPlayerRef = useRef(null)

  const radioAudioContextRef = useRef(null)
  const radioAnalyserRef = useRef(null)
  const radioSourceNodeRef = useRef(null)
  const radioGainNodeRef = useRef(null)
  const radioCompressorRef = useRef(null)

  const effectiveVolumeRef = useRef(0)
  const loopbackStreamRef = useRef(null)
  const audioMotionRef = useRef(null)
  const audioMotionContainerRef = useRef(null)
  const audioMotionSourceRef = useRef(null)
  const radioVizStreamDestRef = useRef(null)
  const radioStallTimeoutRef = useRef(null)
  const sessionReconnectTimerRef = useRef(null)
  const sessionReconnectCountRef = useRef(0)
  const electricEnergyRef = useRef(0)
  const vizBgCanvasRef = useRef(null)

  // Inicjalizacja AudioMotionAnalyzer — jeden raz przy mount
  useEffect(() => {
    if (!audioMotionContainerRef.current) return

    const audioMotion = new AudioMotionAnalyzer(audioMotionContainerRef.current, {
      mode: 1,                // oddzielne słupki
      channelLayout: 'single',
      frequencyScale: 'log',
      barSpace: 0.1,
      fftSize: 8192,
      smoothing: 0.75,
      showPeaks: false,
      showScaleX: false,
      showScaleY: false,
      overlay: true,
      bgAlpha: 0,
      connectSpeakers: false,
      maxFreq: 16000,
    })

    audioMotion.registerGradient('app', {
      colorStops: [
        { color: '#ff6b2b', pos: 0 },
        { color: '#ffac50', pos: 0.5 },
        { color: '#352c28', pos: 1 },
      ],
    })
    audioMotion.gradient = 'app'

    audioMotion.onCanvasDraw = instance => {
      const bass = instance.getEnergy('bass')
      const overall = instance.getEnergy()
      // Bass daje kopnięcia (kick, sub) — ważniejszy dla chaosu i dynamiki
      electricEnergyRef.current = Math.min(1, bass * 0.6 + overall * 0.4)
    }

    audioMotionRef.current = audioMotion

    return () => {
      audioMotion.destroy()
      audioMotionRef.current = null
    }
  }, [])

  // ─── Tło wizualizera — aurora blobs reagujące na energię ────────────────────
  useEffect(() => {
    const canvas = vizBgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const blobs = [
      { x: 0.18, y: 0.75, vx: 0.00028, vy: -0.00019, r: [255, 107, 43] },
      { x: 0.80, y: 0.28, vx: -0.00021, vy: 0.00031, r: [255, 58, 90] },
      { x: 0.52, y: 0.55, vx: 0.00014, vy: 0.00022, r: [255, 176, 72] },
    ]

    let smooth = 0
    let raf

    const draw = () => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      const raw = electricEnergyRef.current || 0
      smooth += (raw - smooth) * 0.06

      blobs.forEach((b) => {
        b.x += b.vx
        b.y += b.vy
        if (b.x < -0.1 || b.x > 1.1) b.vx *= -1
        if (b.y < -0.1 || b.y > 1.1) b.vy *= -1

        const baseR = Math.min(w, h) * 0.52
        const radius = baseR * (1 + smooth * 1.1)
        const alpha = 0.09 + smooth * 0.18

        const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, radius)
        g.addColorStop(0, `rgba(${b.r[0]},${b.r[1]},${b.r[2]},${alpha.toFixed(3)})`)
        g.addColorStop(0.5, `rgba(${b.r[0]},${b.r[1]},${b.r[2]},${(alpha * 0.3).toFixed(3)})`)
        g.addColorStop(1, `rgba(${b.r[0]},${b.r[1]},${b.r[2]},0)`)

        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      })

      raf = requestAnimationFrame(draw)
    }

    const resize = () => {
      const dpr = devicePixelRatio
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    draw()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  // ─── Thumbar — ref zawsze aktualny, listenerzy rejestrują się raz ─────────
  const thumbarActionsRef = useRef({})
  useEffect(() => {
    thumbarActionsRef.current = {
      prev: () => mode === 'radio' ? handleStationPrev() : handleTrackPrevious(isTrackPlaying),
      next: () => mode === 'radio' ? handleStationNext() : handleTrackNext(true),
      togglePlay: () => handlePlayPause(),
    }
  })
  useEffect(() => {
    if (!window.playerBridge) return
    window.playerBridge.onThumbarPrev(() => thumbarActionsRef.current.prev?.())
    window.playerBridge.onThumbarNext(() => thumbarActionsRef.current.next?.())
    window.playerBridge.onThumbarTogglePlay(() => thumbarActionsRef.current.togglePlay?.())
    // Tryb tła — wyłącz ciężkie animacje CSS gdy okno nie jest aktywne
    window.playerBridge.onAppBackground?.((isBackground) => {
      document.documentElement.classList.toggle('app-background', isBackground)
    })
  }, [])

  // ─── Zoom — sync z main + blokada Ctrl+/-/0 ─────────────────────────────
  useEffect(() => {
    window.playerBridge?.onZoomIdx?.((idx) => {
      setZoomIdx(idx)
      setPendingZoom(null)
    })
    function blockZoomKeys(e) {
      if (!e.ctrlKey) return
      if (['Equal','Minus','Digit0','NumpadAdd','NumpadSubtract','Numpad0'].includes(e.code) ||
          ['+','-','0','='].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', blockZoomKeys, { capture: true })
    return () => window.removeEventListener('keydown', blockZoomKeys, { capture: true })
  }, [])

  // ─── Thumbar — aktualizuj ikonę play/pause ────────────────────────────────
  useEffect(() => {
    window.playerBridge?.setThumbarPlaying(
      mode === 'radio' ? isRadioPlaying : isTrackPlaying
    )
  }, [isTrackPlaying, isRadioPlaying, mode])

  // ─── Discord Rich Presence ────────────────────────────────────────────────
  useEffect(() => {
    if (!window.playerBridge) return
    const timer = setTimeout(() => {
      if (mode === 'player') {
        if (!isTrackPlaying || !currentTrack) {
          window.playerBridge.clearDiscordPresence()
          return
        }
        window.playerBridge.updateDiscordPresence({
          type: 2,
          name: currentTrack.title || 'Nieznany utwór',
          details: currentTrack.author || 'YouTube',
          largeImageKey: currentTrack.thumbnail || 'appicon',
          largeImageText: currentTrack.title || '',
          smallImageKey: 'appicon',
          smallImageText: 'byPerru',
          startTimestamp: Date.now(),
        })
      } else {
        if (!isRadioPlaying || !currentStation) {
          window.playerBridge.clearDiscordPresence()
          return
        }
        window.playerBridge.updateDiscordPresence({
          type: 2,
          name: radioNowPlaying ? `${currentStation.name} | ${radioNowPlaying}` : currentStation.name,
          details: radioNowPlaying || undefined,
          largeImageKey: 'appicon',
          largeImageText: currentStation.name || 'Radio',
          smallImageKey: currentStation.favicon || undefined,
          smallImageText: currentStation.name || '',
          startTimestamp: Date.now(),
        })
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [mode, isTrackPlaying, isRadioPlaying, currentTrack, currentStation, radioNowPlaying])

  // ─── Historia odtwarzania (localStorage, 2 dni) ───────────────────────────
  useEffect(() => {
    if (!currentTrack?.id) return
    setTrackHistory((prev) => {
      const entry = { track: currentTrack, ts: Date.now() }
      const updated = [entry, ...prev.filter((e) => e.track.id !== currentTrack.id)].slice(0, 40)
      saveHistory(updated)
      return updated
    })
  }, [currentTrack])

  // ─── Podpowiedzi w wyszukiwarce ───────────────────────────────────────────
  useEffect(() => {
    if (searchTerm.length < 3 || !window.playerBridge?.searchYoutube) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const raw = await window.playerBridge.searchYoutube(searchTerm)
        setSuggestions(filterPlayableTracks(raw).slice(0, 6))
      } catch {
        setSuggestions([])
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // ─── Auto-scroll do aktywnego utworu ─────────────────────────────────────
  useEffect(() => {
    if (mode !== 'player') return
    activeTrackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [currentTrack, mode])

  const activeGenre = useMemo(
    () => genres.find((genre) => genre.id === genreId) ?? genres[0],
    [genreId],
  )

  const radioFavorites = useMemo(
    () => dedupeById(favorites.filter((entry) => entry.type === 'radio').map((entry) => entry.item)),
    [favorites],
  )

  const trackFavorites = useMemo(
    () => dedupeById(favorites.filter((entry) => entry.type === 'player').map((entry) => entry.item)),
    [favorites],
  )

  const genreScopedStations = useMemo(
    () => dedupeStations(dedupeById([...stations, ...countryBoostStations])),
    [countryBoostStations, stations],
  )

  const countryOptions = useMemo(() => {
    const options = genreScopedStations
      .filter((station) => station.countryCode)
      .map((station) => ({
        code: station.countryCode,
        label: station.country,
      }))

    return dedupeById(options.map((option) => ({ id: option.code, ...option }))).sort((left, right) =>
      left.label.localeCompare(right.label, 'pl'),
    )
  }, [genreScopedStations])

  const allTracks = searchResults.length > 0 ? searchResults : curatedTracks

  const visibleStations = useMemo(() => {
    const source = libraryView === 'favorites' ? radioFavorites : genreScopedStations

    let filtered = source

    if (countryFilter !== 'ALL') {
      if (libraryView === 'favorites') {
        filtered = source.filter((station) => station.countryCode === countryFilter)
      } else {
        const merged = dedupeStations(dedupeById([...source, ...countryBoostStations]))
        filtered = merged.filter((station) => station.countryCode === countryFilter)
      }
    }

    return sortStationsByFamily(filtered)
  }, [countryBoostStations, countryFilter, genreScopedStations, libraryView, radioFavorites])

  const filteredStations = useMemo(() => {
    const term = stationSearchTerm.trim().toLowerCase()
    const genre = RADIO_GENRES.find((g) => g.id === radioTagFilter)

    let result = visibleStations

    if (genre && genre.tags) {
      result = result.filter((station) => {
        const tags = (station.tags || '').toLowerCase()
        return genre.tags.some((t) => tags.includes(t))
      })
    }

    if (term) {
      result = result.filter((station) => {
        const name = (station.name || '').toLowerCase()
        const family = normalizeStationFamilyName(station.name)
        const tags = (station.tags || '').toLowerCase()
        return name.includes(term) || family.includes(term) || tags.includes(term)
      })
    }

    return result
  }, [stationSearchTerm, radioTagFilter, visibleStations])

  // Reset widocznej liczby stacji gdy lista się zmienia
  useEffect(() => {
    setVisibleStationCount(40)
  }, [stationSearchTerm, radioTagFilter, countryFilter, libraryView])

  // IntersectionObserver — dokładaj 40 stacji gdy sentinel wchodzi w viewport
  useEffect(() => {
    const sentinel = stationListSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleStationCount((n) => n + 40)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [filteredStations.length])

  const knownRadioStations = useMemo(
    () => dedupeStations(dedupeById([...stations, ...countryBoostStations, ...radioFavorites])),
    [countryBoostStations, radioFavorites, stations],
  )

  const visibleTracks = useMemo(
    () => applyFilters(libraryView === 'favorites' ? trackFavorites : allTracks, filters),
    [allTracks, libraryView, trackFavorites, filters],
  )

  // Reset licznika gdy zmienia się lista / filtry
  useEffect(() => { setVisibleTrackCount(40) }, [allTracks, filters, libraryView])

  // IntersectionObserver — dokładaj 40 tracków gdy sentinel wchodzi w viewport
  useEffect(() => {
    const sentinel = trackListSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleTrackCount((n) => n + 40) },
      { threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleTracks.length])

  const activeItem = mode === 'radio' ? currentStation : currentTrack
  const currentRadioStreamEntry = stationStreams[stationStreamIndex] || null
  const currentRadioStreamUrl = currentRadioStreamEntry?.url || currentStation?.url || ''

  // ─── Ping do stacji radiowej ──────────────────────────────────────────────
  const [pingMs, setPingMs] = useState(null)
  useEffect(() => {
    if (mode !== 'radio' || !currentRadioStreamUrl) { setPingMs(null); return }
    let cancelled = false
    async function doPing() {
      const url = currentRadioStreamUrl
      const t0 = performance.now()
      try {
        const ctrl = new AbortController()
        const timeout = setTimeout(() => ctrl.abort(), 5000)
        await fetch(url, { method: 'HEAD', signal: ctrl.signal, cache: 'no-store' })
        clearTimeout(timeout)
        if (!cancelled) setPingMs(Math.round(performance.now() - t0))
      } catch {
        if (!cancelled) setPingMs(-1)
      }
    }
    doPing()
    const interval = setInterval(doPing, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [mode, currentRadioStreamUrl])

  const effectiveVolume = useMemo(() => toEffectiveVolume(volumePercent, 'log'), [volumePercent])
  const favoriteKey = activeItem ? `${mode}:${activeItem.id}` : ''
  const isFavorite = favoriteKey ? favorites.some((entry) => entry.key === favoriteKey) : false
  const currentTitle = activeItem?.title || activeItem?.name || 'Wybierz coś do odpalenia'
  const isRadioVisualLoading = mode === 'radio' && (radioLoading || isSwitchingStationStream || isRadioBuffering)
  const shouldShowRadioErrorStatus = mode === 'radio' && Boolean(radioError) && !isRadioVisualLoading
  const fallbackStatusMatch = shouldShowRadioErrorStatus
    ? String(radioError).match(/^Radio\s+(.+?)\s+nie działa, odpalamy stację podstawową\.?$/i)
    : null
  const fallbackStationName = fallbackStatusMatch?.[1] || ''
  const isAlreadyOnStationStatus = /^Już jesteś na tej stacji\.?$/i.test(String(radioError || '').trim())
  const radioVisualizerStatus = shouldShowRadioErrorStatus
    ? radioError
    : (!currentStation
    ? 'Wybierz stację'
    : (isRadioVisualLoading ? 'Ładowanie stacji...' : (!isRadioPlaying ? 'Radio zatrzymane' : '')))

  const playerArt = mode === 'radio'
    ? safeArt(currentStation?.favicon, currentStation?.name || activeGenre.label, 'radio')
    : safeArt(currentTrack?.thumbnail, currentTrack?.title || activeGenre.label, 'track')

  const playerFlag = mode === 'radio' ? countryFlagEmoji(currentStation?.countryCode) : 'YT'
  const shouldScrollTitle = currentTitle.length > 42

  useEffect(() => {
    localStorage.setItem('hiphop-player-favorites', JSON.stringify(favorites))
  }, [favorites])

  // Zapisuj głośność do localStorage przy każdej zmianie + synchronizuj dźwięki UI
  useEffect(() => {
    localStorage.setItem('hiphop-player-volume', String(volumePercent))
    setUiVolume(volumePercent)
  }, [volumePercent])


  // Global radio search (radio-browser.info, cały świat)
  useEffect(() => {
    if (!radioGardenMode) return
    clearTimeout(rgDebounceRef.current)
    const q = stationSearchTerm.trim()
    const genre = RADIO_GENRES.find(g => g.id === radioTagFilter)
    const tagQuery = genre?.tags?.[0] || ''
    const fullQuery = [q, tagQuery].filter(Boolean).join(' ')
    if (!fullQuery) { setRgResults([]); return }
    rgDebounceRef.current = setTimeout(async () => {
      setRgLoading(true)
      try {
        const params = { name: fullQuery, limit: '80', hidebroken: 'false', order: 'clickcount', reverse: 'true' }
        if (rgCountry) params.countrycode = rgCountry
        const raw = await fetchStationsFromMirrors(params)
        setRgResults(dedupeById(raw.filter(s => s.urlResolved || s.url).map(normalizeStation)))
      } catch { setRgResults([]) }
      finally { setRgLoading(false) }
    }, 400)
  }, [stationSearchTerm, radioGardenMode, rgCountry, radioTagFilter])

  // Zapisuj ostatnią stację do localStorage przy każdej zmianie currentStation
  useEffect(() => {
    if (currentStation && currentStation.id) {
      localStorage.setItem('hiphop-player-last-station', JSON.stringify(currentStation))
    }
  }, [currentStation])

  useEffect(() => {
    effectiveVolumeRef.current = effectiveVolume

    if (audioRef.current) {
      // Gdy gain node jest aktywny, on kontroluje głośność — audio element musi być na 1
      // żeby nie mnożyć głośności przez siebie (effectiveVolume * effectiveVolume = effectiveVolume²)
      audioRef.current.volume = (radioGainNodeRef.current && effectiveVolume > 0) ? 1 : effectiveVolume
    }

    if (radioAudioContextRef.current && radioGainNodeRef.current) {
      const now = radioAudioContextRef.current.currentTime
      radioGainNodeRef.current.gain.cancelScheduledValues(now)
      radioGainNodeRef.current.gain.setTargetAtTime(effectiveVolume, now, 0.05)
    }
  }, [effectiveVolume])

  useEffect(() => {
    let ignore = false

    async function loadStations() {
      setRadioLoading(true)
      setRadioError('')

      try {
        const responses = await Promise.all(
          activeGenre.radioQueries.map(async (query) => {
            return fetchStationsFromMirrors({
              limit: '80',
              ...query,
            })
          }),
        )

        const normalized = dedupeStations(dedupeById(
          responses
            .flat()
            .filter((station) => station.urlResolved || station.url)
            .map(normalizeStation),
        )).slice(0, 220)

        if (!ignore) {
          setStations(normalized)
          setCurrentStation((previous) => {
            const selected = pickPreferredStation(normalized, previous)
            const plan = buildStationPlaybackCandidates(selected, normalized)

            setStationStreams(plan.entries)
            setStationStreamIndex(0)
            setPrimaryStationStreamCount(plan.primaryCount)

            return selected
          })

          if (normalized.length === 0) {
            setRadioError('Nie znalazłem stacji w tym klimacie. Spróbuj inny gatunek.')
          }
        }
      } catch {
        if (!ignore) {
          setRadioError('Nie udało się pobrać stacji dla tego klimatu.')
          setStations([])
          setCurrentStation(null)
          setStationStreams([])
          setStationStreamIndex(0)
          setPrimaryStationStreamCount(0)

        }
      } finally {
        if (!ignore) {
          setRadioLoading(false)
        }
      }
    }

    loadStations()

    return () => {
      ignore = true
    }
  }, [activeGenre])

  useEffect(() => {
    let ignore = false

    async function loadCountryBoostStations() {
      if (countryFilter === 'ALL' || libraryView === 'favorites') {
        setCountryBoostStations([])
        return
      }

      try {
        const response = await fetchStationsFromMirrors({
          countrycode: countryFilter,
          limit: '300',
          order: 'clickcount',
          reverse: 'true',
          hidebroken: 'false',
        })

        const extraByName = countryFilter === 'PL'
          ? await Promise.all([
            fetchStationsFromMirrors({ name: 'VOX FM', countrycode: 'PL', limit: '80', hidebroken: 'false' }),
            fetchStationsFromMirrors({ name: 'Radio VOX', countrycode: 'PL', limit: '80', hidebroken: 'false' }),
          ])
          : []

        const boostedResponse = [...response, ...extraByName.flat()]

        const fromApi = dedupeStations(dedupeById(
          boostedResponse
            .filter((station) => station.urlResolved || station.url)
            .map(normalizeStation),
        ))

        const curated = countryFilter === 'PL' ? CURATED_PL_STATIONS : []
        const normalized = dedupeStations(dedupeById([...curated, ...fromApi])).slice(0, 300)

        if (!ignore) {
          setCountryBoostStations(normalized)
        }
      } catch {
        if (!ignore) {
          setCountryBoostStations([])
        }
      }
    }

    loadCountryBoostStations()

    return () => {
      ignore = true
    }
  }, [countryFilter, libraryView])

  useEffect(() => {
    let ignore = false

    async function loadCuratedTracks() {
      if (!window.playerBridge?.searchYoutube) {
        setCuratedTracks([])
        setTrackError('Wyszukiwanie YouTube działa tylko po uruchomieniu przez Electron.')
        return
      }

      setTrackLoading(true)
      setTrackError('')

      try {
        const q1 = curatedTracksKey === 0
          ? 'muzyka popular official audio'
          : buildFilteredQuery(filtersRef.current)
        const q2 = curatedTracksKey === 0
          ? 'music popular official video'
          : buildFilteredQuery({ ...filtersRef.current, era: 'all' })
        const eraOptions = curatedTracksKey === 0 ? {} : getEraDateRange(filtersRef.current.era)
        const [r1, r2] = await Promise.all([
          window.playerBridge.searchYoutube(q1, eraOptions),
          window.playerBridge.searchYoutube(q2, {}),
        ])
        const found = dedupeById(filterPlayableTracks([...r1, ...r2]))

        if (!ignore) {
          const shuffled = spreadByAuthor(shuffleArray(found))
          setCuratedTracks(shuffled)
          setSearchResults([])
          setCurrentTrack(shuffled[0] ?? null)
          setPreviousTracks([])
          setActiveTrackQuery(q1)

          if (found.length === 0) {
            setTrackError('Nie znalazłem pojedynczych utworów dla tego klimatu.')
          }
        }
      } catch {
        if (!ignore) {
          setTrackError('Nie udało się pobrać wyników YouTube.')
          setCuratedTracks([])
          setCurrentTrack(null)
        }
      } finally {
        if (!ignore) {
          setTrackLoading(false)
        }
      }
    }

    loadCuratedTracks()

    return () => {
      ignore = true
    }
  }, [activeGenre, curatedTracksKey])


  useEffect(() => {
    if (mode === 'radio') {
      setIsTrackPlaying(false)
      setTrackTime(0)
      return
    }

    audioRef.current?.pause()
    setIsRadioPlaying(false)
    setIsRadioBuffering(false)
  }, [mode])

  useEffect(() => {
    if (!audioRef.current || !currentRadioStreamUrl) {
      return
    }

    audioRef.current.src = currentRadioStreamUrl

    if (radioStallTimeoutRef.current) clearTimeout(radioStallTimeoutRef.current)

    if (mode === 'radio' && isRadioPlaying) {
      audioRef.current.play().catch(() => {
        tryNextStationStream()
      })
    }
  }, [currentRadioStreamUrl, isRadioPlaying, mode])

  useEffect(() => {
    const audioElement = audioRef.current

    function disconnectAudioMotion() {
      if (audioMotionSourceRef.current && audioMotionRef.current) {
        try { audioMotionRef.current.disconnectInput(audioMotionSourceRef.current) } catch {}
        audioMotionSourceRef.current = null
      }
    }

    // ── TRYB PLAYER ─────────────────────────────────────────────────────────
    // Loopback stream dla player mode jest zarządzany przez osobny useEffect([mode])
    if (mode !== 'radio') return

    // ── RADIO ZATRZYMANE / BRAK ELEMENTU ────────────────────────────────────
    if (!audioElement || !isRadioPlaying) {
      disconnectAudioMotion()
      return
    }

    // ── RADIO GRA ────────────────────────────────────────────────────────────
    let cancelled = false

    async function startAudioReactiveVisualizer() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) return

      if (!radioAudioContextRef.current) {
        radioAudioContextRef.current = new AudioContextClass()
      }
      const context = radioAudioContextRef.current

      if (context.state === 'suspended') {
        try { await context.resume() } catch { return }
      }

      if (!radioSourceNodeRef.current) {
        try {
          radioSourceNodeRef.current = context.createMediaElementSource(audioElement)
        } catch {
          radioSourceNodeRef.current = null
        }
      }

      if (!radioAnalyserRef.current) {
        const analyser = context.createAnalyser()
        analyser.fftSize = 2048
        analyser.smoothingTimeConstant = 0.12
        analyser.minDecibels = -110
        analyser.maxDecibels = -18
        radioAnalyserRef.current = analyser
      }

      if (!radioCompressorRef.current) {
        const compressor = context.createDynamicsCompressor()
        compressor.threshold.value = -18
        compressor.knee.value = 12
        compressor.ratio.value = 4
        compressor.attack.value = 0.015
        compressor.release.value = 0.2
        radioCompressorRef.current = compressor
      }

      if (!radioGainNodeRef.current) {
        const gainNode = context.createGain()
        gainNode.gain.value = effectiveVolumeRef.current
        radioGainNodeRef.current = gainNode
      }

      if (radioSourceNodeRef.current && radioAnalyserRef.current && radioCompressorRef.current && radioGainNodeRef.current) {
        try {
          radioSourceNodeRef.current.connect(radioCompressorRef.current)
          radioCompressorRef.current.connect(radioAnalyserRef.current)
          radioAnalyserRef.current.connect(radioGainNodeRef.current)
          radioGainNodeRef.current.connect(context.destination)
        } catch { /* already connected */ }
      }

      if (radioGainNodeRef.current) {
        const now = context.currentTime
        radioGainNodeRef.current.gain.cancelScheduledValues(now)
        radioGainNodeRef.current.gain.setValueAtTime(effectiveVolumeRef.current, now)
      }
      if (audioRef.current) audioRef.current.volume = 1

      // Bridge audio do audiomotion przez MediaStreamDestinationNode
      if (cancelled) return
      if (radioCompressorRef.current && audioMotionRef.current) {
        if (!radioVizStreamDestRef.current) {
          radioVizStreamDestRef.current = context.createMediaStreamDestination()
          // Podłącz wizualizer przed gain nodem (po kompresorze) — niezależny od głośności
          radioCompressorRef.current.connect(radioVizStreamDestRef.current)
        }
        disconnectAudioMotion()
        const amCtx = audioMotionRef.current.audioCtx
        if (amCtx.state === 'suspended') { try { await amCtx.resume() } catch {} }
        const src = amCtx.createMediaStreamSource(radioVizStreamDestRef.current.stream)
        audioMotionRef.current.connectInput(src)
        audioMotionSourceRef.current = src
      }
    }

    startAudioReactiveVisualizer()

    return () => {
      cancelled = true
      disconnectAudioMotion()
    }
  }, [isRadioPlaying, mode, currentRadioStreamUrl])

  // ── PLAYER MODE: loopback audio → wizualizer (podłącz gdy gra, odłącz gdy pauza) ──
  useEffect(() => {
    if (mode !== 'player') {
      if (loopbackStreamRef.current) {
        loopbackStreamRef.current.getTracks().forEach(t => t.stop())
        loopbackStreamRef.current = null
      }
      if (audioMotionRef.current && audioMotionSourceRef.current) {
        try { audioMotionRef.current.disconnectInput(audioMotionSourceRef.current) } catch {}
        audioMotionSourceRef.current = null
      }
      return
    }

    if (!isTrackPlaying) {
      if (audioMotionRef.current && audioMotionSourceRef.current) {
        try { audioMotionRef.current.disconnectInput(audioMotionSourceRef.current) } catch {}
        audioMotionSourceRef.current = null
      }
      return
    }

    if (audioMotionSourceRef.current) return

    let cancelled = false

    async function connectLoopback() {
      try {
        let stream = loopbackStreamRef.current
        if (!stream) {
          stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { width: 1, height: 1 } })
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
          stream.getVideoTracks().forEach(t => t.stop())
          loopbackStreamRef.current = stream
        }
        const amCtx = audioMotionRef.current?.audioCtx
        if (!amCtx || !audioMotionRef.current || cancelled) return
        if (amCtx.state === 'suspended') { try { await amCtx.resume() } catch {} }
        const src = amCtx.createMediaStreamSource(stream)
        audioMotionRef.current.connectInput(src)
        audioMotionSourceRef.current = src
      } catch (e) {
        console.warn('[loopback]', e)
      }
    }

    connectLoopback()
    return () => { cancelled = true }
  }, [isTrackPlaying, mode])

  useEffect(() => {
    let disposed = false
    let pollTimer = null

    if (mode !== 'radio' || !currentRadioStreamUrl) {
      setRadioNowPlaying('')
      setRadioPlayHistory([])
      prevRadioNowPlayingRef.current = ''
      return undefined
    }

    async function pullNowPlaying() {
      if (!window.playerBridge?.getRadioNowPlaying) {
        return
      }

      try {
        const title = await window.playerBridge.getRadioNowPlaying({
          streamUrl: currentRadioStreamUrl,
          stationId: currentStation?.id,
        })

        if (disposed) {
          return
        }

        const nextTitle = String(title || '').trim()
        if (nextTitle !== prevRadioNowPlayingRef.current) {
          setRadioNowPlayingAt(nextTitle ? new Date() : null)
        }
        setRadioNowPlaying(nextTitle)
      } catch {
        if (!disposed) {
          setRadioNowPlaying('')
          setRadioNowPlayingAt(null)
        }
      }

      if (!disposed) {
        pollTimer = window.setTimeout(pullNowPlaying, 30000)
      }
    }

    setRadioPlayHistory([])
    prevRadioNowPlayingRef.current = ''
    setRadioNowPlaying('')
    setRadioNowPlayingAt(null)
    pullNowPlaying()

    return () => {
      disposed = true

      if (pollTimer) {
        window.clearTimeout(pollTimer)
      }
    }
  }, [currentRadioStreamUrl, currentStation?.id, currentStation?.lastSong, mode])

  useEffect(() => {
    if (!radioNowPlaying) {
      prevRadioNowPlayingRef.current = ''
      return
    }
    if (prevRadioNowPlayingRef.current && radioNowPlaying !== prevRadioNowPlayingRef.current) {
      const old = prevRadioNowPlayingRef.current
      const stationName = String(currentStation?.name || '').toLowerCase().trim()
      const isStationName = stationName && old.toLowerCase().trim().includes(stationName)
      if (!isStationName) {
        setRadioPlayHistory([old])
      }
    }
    prevRadioNowPlayingRef.current = radioNowPlaying
  }, [radioNowPlaying, currentStation?.name])

  useEffect(() => {
    if (mode !== 'radio' || !radioError) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setRadioError('')
    }, 5200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [radioError, mode])

  useEffect(() => {
    if (mode !== 'player' || !trackError) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setTrackError('')
    }, 5200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [trackError, mode])

  // Preload 20 kolejnych utworów gdy dojdziemy do ostatniego w liście
  useEffect(() => {
    if (mode !== 'player' || !currentTrack || loadingMoreTracks) return
    const idx = visibleTracks.findIndex((t) => t.id === currentTrack.id)
    if (idx !== visibleTracks.length - 1 || visibleTracks.length === 0) return
    const key = `${currentTrack.id}-${visibleTracks.length}`
    if (preloadedForRef.current === key) return
    preloadedForRef.current = key
    loadMoreTracks(20).catch(() => {})
  }, [currentTrack?.id, visibleTracks.length, loadingMoreTracks, mode])

  useEffect(() => {
    if (mode !== 'player' || !currentTrack) {
      setResolvedTrackUrl(null)
      return
    }
    setResolvedTrackUrl(currentTrack.url)
  }, [currentTrack, mode])

  useEffect(() => {
    if (mode !== 'player' || !currentTrack) {
      return undefined
    }

    const interval = window.setInterval(() => {
      const player = trackPlayerRef.current

      if (!player) {
        return
      }

      const nextTime = Number(player.currentTime ?? 0)
      const nextDuration = Number(player.duration ?? 0)

      if (Number.isFinite(nextTime) && !isSeekingRef.current) {
        trackTimeRef.current = nextTime
        setTrackTime(nextTime)
      }

      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setTrackDuration(nextDuration)
      }
    }, 800)

    return () => window.clearInterval(interval)
  }, [currentTrack, mode])

  function showSessionToast(msg) {
    setSessionToast(msg)
    clearTimeout(sessionToastTimerRef.current)
    sessionToastTimerRef.current = setTimeout(() => setSessionToast(''), 2800)
  }

  function handleCopyCode() {
    navigator.clipboard?.writeText(sessionCode)
    setCodeCopied(true)
    clearTimeout(codeCopiedTimerRef.current)
    codeCopiedTimerRef.current = setTimeout(() => setCodeCopied(false), 2000)
  }

  function handleSuggest(item) {
    addToQueue(item)
    setSuggestedIds(prev => new Set(prev).add(item.id))
    showSessionToast(`Zasugerowano: ${item.title}`)
  }

  // Zwraca true jeśli akcja jest dozwolona; false + toast jeśli zablokowana
  function checkPerm(perm) {
    if (!inSession || isHost) return true
    if (myPermissions[perm]) return true
    const labels = { canPlay: 'uprawnienia moderatora', canSkip: 'uprawnienia moderatora', canAdd: 'uprawnienia moderatora' }
    showSessionToast(`Tylko host może ${labels[perm] ?? 'to zrobić'} — poproś o uprawnienia`)
    return false
  }

  function updateMode(nextMode, remote = false) {
    if (!remote && inSession && !isHost && nextMode !== mode) {
      showSessionToast('Tylko host może zmieniać zakładki podczas sesji')
      return
    }
    setMode(nextMode)
    if (nextMode === 'radio') setLyricsVisible(false)
    localStorage.setItem('hiphop-player-mode', nextMode)
    setLibraryView('all')
    setStationSearchTerm('')
    if (!remote && inSession) notifyAction('modeChange', { mode: nextMode })
  }
  // Zapisuj tryb do localStorage przy każdej zmianie
  useEffect(() => {
    localStorage.setItem('hiphop-player-mode', mode)
  }, [mode])

  // Zapisuj filtry do localStorage przy każdej zmianie
  useEffect(() => {
    localStorage.setItem('hiphop-player-trackfilters', JSON.stringify(filters))
  }, [filters])

  async function handleTrackSearch(event) {
    event.preventDefault()

    if (!searchTerm.trim()) return

    if (!window.playerBridge?.searchYoutube) {
      setTrackError('Wyszukiwanie YouTube działa tylko po uruchomieniu przez Electron.')
      return
    }

    setTrackLoading(true)
    setTrackError('')

    // Wykryj link do playlisty YouTube — załaduj wszystkie utwory
    const plId = extractYoutubePlaylistId(searchTerm.trim())
    if (plId && window.playerBridge.getPlaylist) {
      try {
        const tracks = await window.playerBridge.getPlaylist(plId)
        if (tracks && tracks.length > 0) {
          const filtered = filterPlayableTracks(tracks)
          setSearchResults(filtered)
          setActiveTrackQuery(`Playlista (${filtered.length} utworów)`)
          selectTrack(filtered[0], true, false)
        } else {
          setTrackError('Nie znaleziono utworów w tej playliście (może być prywatna).')
        }
      } catch {
        setTrackError('Nie udało się załadować playlisty.')
      } finally {
        setTrackLoading(false)
      }
      return
    }

    // Wykryj link YouTube — załaduj konkretne wideo (działa też dla live)
    const ytId = extractYoutubeId(searchTerm.trim())
    if (ytId && window.playerBridge.getVideoById) {
      try {
        const video = await window.playerBridge.getVideoById(ytId)
        if (video) {
          setSearchResults([video])
          setCurrentTrack(video)
          setPreviousTracks([])
          setActiveTrackQuery('')
        } else {
          setTrackError('Nie znaleziono wideo pod tym linkiem.')
        }
      } catch {
        setTrackError('Nie udało się pobrać informacji o wideo.')
      } finally {
        setTrackLoading(false)
      }
      return
    }

    try {
      const raw = await window.playerBridge.searchYoutube(searchTerm)
      const found = filterPlayableTracks(raw)
      setSearchResults(found)
      setActiveTrackQuery(searchTerm)

      if (found.length === 0) {
        setTrackError('Brak krótkich pojedynczych utworów. Zmień frazę i spróbuj jeszcze raz.')
      }
    } catch {
      setTrackError('Szukajka YouTube chwilowo nie odpowiedziała.')
    } finally {
      setTrackLoading(false)
    }
  }

  function selectStation(station, options = {}) {
    if (currentStation?.id && station?.id && currentStation.id === station.id) {
      setRadioError('Już jesteś na tej stacji.')
      return
    }

    const plan = buildStationPlaybackCandidates(station, knownRadioStations)

    sessionReconnectCountRef.current = 0
    if (sessionReconnectTimerRef.current) { clearTimeout(sessionReconnectTimerRef.current); sessionReconnectTimerRef.current = null }
    setCurrentStation(station)
    setStationStreams(plan.entries)
    setStationStreamIndex(0)
    setPrimaryStationStreamCount(plan.primaryCount)

    setRadioError(options.message || '')
    setIsRadioPlaying(true)
    setIsRadioBuffering(true)
  }


  async function tryNextStationStream() {
    if (isSwitchingStationStream) {
      return
    }

    setIsSwitchingStationStream(true)
    setIsRadioBuffering(true)

    try {
      const primaryTotal = Math.max(1, primaryStationStreamCount || Math.min(3, stationStreams.length))
      if (stationStreamIndex < primaryTotal - 1) {
        setStationStreamIndex((previous) => previous + 1)
        const checkedNow = stationStreamIndex + 1
        const tryingIndex = stationStreamIndex + 2
        setRadioError(`Stream ${checkedNow}/${primaryTotal} nie działa. Próbuję ${tryingIndex}/${primaryTotal}...`)
        return
      }

      if (stationStreamIndex === primaryTotal - 1 && stationStreams.length > primaryTotal) {
        const nextEntry = stationStreams[primaryTotal]
        setStationStreamIndex(primaryTotal)
        setRadioError(`Sprawdziłem ${primaryTotal}/${primaryTotal}. Próbuję wariant ${nextEntry?.label || '128'}...`)
        return
      }

      if (stationStreamIndex >= primaryTotal && stationStreamIndex < stationStreams.length - 1) {
        const nextEntry = stationStreams[stationStreamIndex + 1]
        setStationStreamIndex((previous) => previous + 1)
        setRadioError(`Wariant ${currentRadioStreamEntry?.label || currentStation?.name || 'stacji'} nie działa. Próbuję ${nextEntry?.label || 'następny wariant'}...`)
        return
      }

      // Wszystkie streamy wyczerpane — zatrzymaj i wyczyść src
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current.load()
      }
      setIsRadioPlaying(false)
      setIsRadioBuffering(false)

      // Jeśli gość jest w sesji — automatycznie spróbuj ponownie po 5s (max 3 razy)
      if (inSession && !isHost && currentStation && sessionReconnectCountRef.current < 3) {
        sessionReconnectCountRef.current += 1
        setRadioError(`Połączenie przerwane, ponawiam za 5s... (${sessionReconnectCountRef.current}/3)`)
        if (sessionReconnectTimerRef.current) clearTimeout(sessionReconnectTimerRef.current)
        sessionReconnectTimerRef.current = setTimeout(() => {
          if (currentStation) selectStation(currentStation)
        }, 5000)
      } else {
        sessionReconnectCountRef.current = 0
        setRadioError(`Nie można połączyć z ${currentStation?.name || 'tą stacją'}. Spróbuj kliknąć stację ponownie lub wybierz inną.`)
      }
    } finally {
      setIsSwitchingStationStream(false)
    }
  }

  function selectTrack(track, autoplay = true, notify = false) {
    setCurrentTrack(track)
    setTrackError('')
    setTrackTime(0)
    setTrackDuration(track.seconds || 0)
    setIsTrackReady(false)
    setIsTrackPlaying(autoplay)
    if (notify && inSession) {
      notifyAction('trackChange', { id: track.id, title: track.title, url: track.url, author: track.author, seconds: track.seconds, thumbnail: track.thumbnail, position: 0, playing: autoplay })
    }
  }

  function handleRgPick(rgStation) {
    if (!checkPerm('canSkip') && !checkPerm('canAdd')) return
    selectStation(rgStation)
    if (inSession) notifyAction('stationChange', { id: rgStation.id, name: rgStation.name, url: rgStation.url, country: rgStation.country ?? '', countrycode: rgStation.countryCode ?? '', favicon: rgStation.favicon ?? '', tags: rgStation.tags ?? '', codec: rgStation.codec ?? '', bitrate: rgStation.bitrate ?? 0, lastSong: rgStation.lastSong ?? '' })
  }

  function handleStationNext() {
    if (!checkPerm('canSkip')) return
    if (visibleStations.length === 0) return
    const currentIndex = visibleStations.findIndex((station) => station.id === currentStation?.id)
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + 1) % visibleStations.length
    const station = visibleStations[nextIndex]
    selectStation(station)
    if (inSession) notifyAction('stationChange', { id: station.id, name: station.name, url: station.url, country: station.country ?? '', countrycode: station.countrycode ?? '', favicon: station.favicon ?? '', tags: station.tags ?? '', codec: station.codec ?? '', bitrate: station.bitrate ?? 0, lastSong: station.lastSong ?? '' })
  }

  function handleStationPrev() {
    if (!checkPerm('canSkip')) return
    if (visibleStations.length === 0) return
    const currentIndex = visibleStations.findIndex((station) => station.id === currentStation?.id)
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const prevIndex = (safeIndex - 1 + visibleStations.length) % visibleStations.length
    const station = visibleStations[prevIndex]
    selectStation(station)
    if (inSession) notifyAction('stationChange', { id: station.id, name: station.name, url: station.url, country: station.country ?? '', countrycode: station.countrycode ?? '', favicon: station.favicon ?? '', tags: station.tags ?? '', codec: station.codec ?? '', bitrate: station.bitrate ?? 0, lastSong: station.lastSong ?? '' })
  }

  function pickRandomTrack() {
    if (!checkPerm('canAdd')) return
    if (visibleTracks.length === 0) return
    selectTrack(visibleTracks[Math.floor(Math.random() * visibleTracks.length)], true, true)
  }

  function handlePlayPause() {
    if (!checkPerm('canPlay')) return
    if (mode === 'radio') {
      if (!audioRef.current || !currentRadioStreamUrl) return
      if (isRadioPlaying) {
        audioRef.current.pause()
        setIsRadioPlaying(false)
        setIsRadioBuffering(false)
        if (inSession) notifyAction('playPause', { playing: false, mode: 'radio' })
        return
      }
      setIsRadioBuffering(true)
      audioRef.current.play().then(() => {
        setIsRadioPlaying(true)
        setIsRadioBuffering(false)
        if (inSession) notifyAction('playPause', { playing: true, mode: 'radio' })
      }).catch(() => {
        setIsRadioBuffering(false)
        tryNextStationStream()
      })
      return
    }

    if (!currentTrack?.url) {
      setTrackError('Najpierw wybierz utwór z listy.')
      return
    }

    const nextPlaying = !isTrackPlaying
    setIsTrackPlaying(nextPlaying)
    if (inSession) notifyAction('playPause', { playing: nextPlaying, mode: 'player' })
  }

  async function loadMoreTracks(limit = 5) {
    if (!window.playerBridge?.searchYoutube) {
      return []
    }

    const baseQuery = (activeTrackQuery || activeGenre.seedQuery || '').trim()
    const querySuffixes = ['official audio', 'single', 'clean version', 'studio version', 'lyric video']
    const randomSuffix = querySuffixes[Math.floor(Math.random() * querySuffixes.length)]

    const currentIds = new Set([...allTracks, ...previousTracks].map((item) => item.id))
    const raw = await window.playerBridge.searchYoutube(`${baseQuery} ${randomSuffix}`)
    const fetched = filterPlayableTracks(raw)
    const nextBatch = spreadByAuthor(fetched.filter((item) => !currentIds.has(item.id))).slice(0, limit)

    if (nextBatch.length === 0) {
      return []
    }

    if (searchResults.length > 0) {
      setSearchResults((previous) => [...previous, ...nextBatch])
    } else {
      setCuratedTracks((previous) => [...previous, ...nextBatch])
    }

    return nextBatch
  }

  async function handleTrackNext(autoplay = isTrackPlaying) {
    if (!checkPerm('canSkip')) return

    // Kolejka sugestii — host (lub poza sesją) gra sugerowane w pierwszej kolejności
    const currentQueue = inSession ? sessionSuggestions : localQueueRef.current
    if (currentQueue.length > 0 && (isHost || !inSession)) {
      const next = currentQueue[0]
      if (inSession) {
        removeSuggestion(next.key)
      } else {
        localQueueRef.current = localQueueRef.current.slice(1)
        setLocalQueue(localQueueRef.current)
      }
      selectTrack(next, autoplay, true)
      return
    }

    if (visibleTracks.length === 0) {
      return
    }

    const currentIndex = visibleTracks.findIndex((item) => item.id === currentTrack?.id)
    const safeIndex = currentIndex >= 0 ? currentIndex : 0

    if (currentTrack) {
      setPreviousTracks((previous) => dedupeById([currentTrack, ...previous]).slice(0, 5))
    }

    if (safeIndex < visibleTracks.length - 1) {
      const nextIndex = safeIndex + 1
      selectTrack(visibleTracks[nextIndex], autoplay, true)
      return
    }

    setLoadingMoreTracks(true)
    try {
      const appended = await loadMoreTracks(20)

      if (appended.length > 0) {
        selectTrack(appended[0], autoplay, true)
      } else {
        setTrackError('Brak kolejnych utworów dla tej frazy. Spróbuj innej wyszukiwarki.')
      }
    } catch {
      setTrackError('Nie udało się pobrać kolejnych utworów.')
    } finally {
      setLoadingMoreTracks(false)
    }
  }

  function handleTrackPrevious(autoplay = isTrackPlaying) {
    if (!checkPerm('canSkip')) return
    if (visibleTracks.length === 0 && previousTracks.length === 0) {
      return
    }

    const currentIndex = visibleTracks.findIndex((item) => item.id === currentTrack?.id)

    if (currentIndex > 0) {
      selectTrack(visibleTracks[currentIndex - 1], autoplay, true)
      return
    }

    if (previousTracks.length > 0) {
      const [prevTrack, ...rest] = previousTracks
      setPreviousTracks(rest)
      selectTrack(prevTrack, autoplay, true)
    }
  }

  function toggleFavorite() {
    if (!activeItem) {
      return
    }

    const entry = buildFavoriteEntry(mode, activeItem, genreId)

    setFavorites((previous) =>
      previous.some((item) => item.key === entry.key)
        ? previous.filter((item) => item.key !== entry.key)
        : [entry, ...previous],
    )
  }

  function handleSeekTrack(event) {
    const nextTime = Number(event.target.value)
    seekValueRef.current = nextTime
    // Aktualizuj wizual bezpośrednio przez DOM — zero re-renderów podczas przeciągania
    const dur = Math.max(trackDuration || currentTrack?.seconds || 0, 1)
    const pct = `${Math.min(100, (nextTime / dur) * 100).toFixed(3)}%`
    seekFillRef.current?.style.setProperty('--pct', pct)
    seekThumbRef.current?.style.setProperty('--pct', pct)
    if (seekTimeDisplayRef.current) seekTimeDisplayRef.current.textContent = formatSeconds(nextTime)
  }

  function handleSeekCommit() {
    if (!checkPerm('canPlay')) { isSeekingRef.current = false; setIsSeeking(false); seekValueRef.current = null; return }
    const nextTime = seekValueRef.current
    isSeekingRef.current = false
    setIsSeeking(false)
    if (nextTime === null) return
    seekValueRef.current = null
    setTrackTime(nextTime)
    const player = trackPlayerRef.current
    if (player) {
      if ('currentTime' in player) player.currentTime = nextTime
      else player.seekTo?.(nextTime, 'seconds')
    }
    if (isHost) {
      syncPositionNow(nextTime)
    } else if (inSession) {
      notifyAction('seek', { position: nextTime })
    }
  }

  function handleVolumeChange(event) {
    const nextValue = Number.isFinite(Number(event.target.value))
      ? Math.min(100, Math.max(0, Math.round(Number(event.target.value)))) : 0
    pendingVolumeRef.current = nextValue
    // Aktualizuj wizual i audio bezpośrednio — bez re-renderu
    const pct = `${nextValue}%`
    volumeFillRef.current?.style.setProperty('--pct', pct)
    volumeThumbRef.current?.style.setProperty('--pct', pct)
    if (volumeLabelRef.current) volumeLabelRef.current.textContent = `${nextValue}%`
    const eff = toEffectiveVolume(nextValue, 'log')
    if (audioRef.current) audioRef.current.volume = radioGainNodeRef.current ? 1 : eff
    if (radioGainNodeRef.current && radioAudioContextRef.current) {
      const now = radioAudioContextRef.current.currentTime
      radioGainNodeRef.current.gain.cancelScheduledValues(now)
      radioGainNodeRef.current.gain.setTargetAtTime(eff, now, 0.05)
    }
  }

  function handleVolumeCommit() {
    if (pendingVolumeRef.current !== null) {
      setVolumePercent(pendingVolumeRef.current)
      pendingVolumeRef.current = null
    }
  }

  const sendSysMsgRef = useRef(null)

  const {
    sessionCode,
    isHost,
    listenerCount,
    listeners: sessionListeners,
    myPermissions,
    sessionError: togetherError,
    sessionLoading: togetherLoading,
    inSession,
    suggestions: sessionSuggestions,
    createSession,
    joinSession,
    leaveSession,
    suggestTrack,
    removeSuggestion,
    syncPositionNow,
    updatePermission,
    setModerator,
    notifyAction,
    chatMessages,
    sendChatMessage,
    sendSystemMessage,
    clearChat,
    chatMuted,
    hostNick,
    deleteChatMsg,
    muteChatUser,
    blockChatUser,
    unblockChatUser,
  } = useListenTogether({
    mode,
    currentStation,
    isRadioPlaying,
    currentTrack,
    trackTimeRef,
    isTrackPlaying,
    nickname: myNickname,
    onRemoteStationChange: (stationData) => {
      if (!stationData?.id) return
      selectStation(stationData)
    },
    onRemoteTrackChange: (trackData) => {
      setCurrentTrack(trackData)
      setIsTrackReady(false)
      setTrackTime(trackData.position ?? 0)
    },
    onRemoteSeek: (time) => {
      pendingRemoteSeekRef.current = time
      const player = trackPlayerRef.current
      if (!player) return
      if ('currentTime' in player) player.currentTime = time
      else player.seekTo?.(time, 'seconds')
      setTrackTime(time)
    },
    onRemotePlayPause: (playing, audioMode) => {
      if (audioMode === 'radio') {
        if (!playing) {
          audioRef.current?.pause()
          setIsRadioPlaying(false)
          setIsRadioBuffering(false)
        } else if (audioRef.current) {
          setIsRadioBuffering(true)
          audioRef.current.play().then(() => { setIsRadioPlaying(true); setIsRadioBuffering(false) }).catch(() => setIsRadioBuffering(false))
        }
      } else {
        setIsTrackPlaying(playing)
      }
    },
    onRemoteModeChange: (nextMode) => {
      updateMode(nextMode, true)
    },
    onActionNotification: (nick, type, payload) => {
      const sysVerb = {
        playPause: payload.playing
          ? `▶ ${nick} wznowił ${payload.mode === 'radio' ? 'radio' : 'odtwarzanie'}`
          : `⏸ ${nick} wstrzymał ${payload.mode === 'radio' ? 'radio' : 'odtwarzanie'}`,
        trackChange: `🎵 ${nick} włączył: ${payload.title ?? ''}`,
        modeChange: `🔄 ${nick} przełączył na ${payload.mode === 'radio' ? 'Radio' : 'Player'}`,
        stationChange: `📻 ${nick} zmienił stację: ${payload.name ?? ''}`,
      }
      const text = sysVerb[type]
      if (text) sendSysMsgRef.current?.(text)
      showSessionToast(text?.replace(/^[^ ]+ /, '') ?? `${nick} wykonał akcję`)
    },
  })

  // Zawsze aktualny ref do sendSystemMessage (używany w onActionNotification przed inicjalizacją)
  sendSysMsgRef.current = sendSystemMessage

  // Reset po zakończeniu sesji
  useEffect(() => {
    if (!inSession) {
      setSuggestedIds(new Set())
      setChatUnread(0)
      setLibraryView((v) => (v === 'chat') ? 'all' : v)
    }
  }, [inSession])

  // Kolejka: w sesji używamy Firebase (sessionSuggestions), poza sesją — lokalną
  const activeQueue = inSession ? sessionSuggestions : localQueue
  localQueueRef.current = localQueue

  function addToQueue(item) {
    if (inSession) {
      suggestTrack(item)
    } else {
      const entry = { ...item, key: `local-${Date.now()}-${Math.random()}` }
      localQueueRef.current = [...localQueueRef.current, entry]
      setLocalQueue(localQueueRef.current)
    }
  }

  function removeFromQueue(key) {
    if (inSession) {
      removeSuggestion(key)
    } else {
      localQueueRef.current = localQueueRef.current.filter((i) => i.key !== key)
      setLocalQueue(localQueueRef.current)
    }
  }

  function shiftQueue() {
    if (inSession) {
      if (sessionSuggestions.length > 0) removeSuggestion(sessionSuggestions[0].key)
    } else {
      localQueueRef.current = localQueueRef.current.slice(1)
      setLocalQueue(localQueueRef.current)
    }
  }

  // Monopoly: auto-otwórz dla klienta gdy host zacznie grę
  const monopolyEndedRef = useRef(false)
  useEffect(() => {
    if (!sessionCode) {
      monopolyAutoOpenedRef.current = false
      monopolyEndedRef.current = false
      return
    }
    monopolyEndedRef.current = false
    const gRef = ref(db, `sessions/${sessionCode}/monopoly`)
    const unsub = onValue(gRef, (snap) => {
      const data = snap.val()
      // Auto-open for color_pick AND playing — once per session
      const shouldOpen = (data?.state === 'color_pick' || data?.state === 'playing') && !monopolyEndedRef.current
      if (shouldOpen && !monopolyAutoOpenedRef.current) {
        monopolyAutoOpenedRef.current = true
        const players = data.playerOrder || []
        setMonopolyPlayers(players)
        setGameState(data.state === 'playing' ? 'playing' : 'waiting')
        setMonopolyOpen(true)
      }
      // If already open and state transitions to playing, update local gameState
      if (data?.state === 'playing' && monopolyAutoOpenedRef.current) {
        setGameState('playing')
      }
      if (data?.state === 'ended' && !monopolyEndedRef.current) {
        monopolyEndedRef.current = true  // prevent any further auto-open
        // Auto-close after 6s, then remove the Firebase node (host only handled inside game)
        setTimeout(() => {
          setMonopolyOpen(false)
          setGameState('waiting')
          monopolyAutoOpenedRef.current = false
        }, 6000)
      }
      if (!data) {
        monopolyAutoOpenedRef.current = false
        monopolyEndedRef.current = false
        setGameState('waiting')
      }
    })
    return () => unsub()
  }, [sessionCode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Podobne: odśwież gdy kolejka urośnie o 3 elementy
  useEffect(() => {
    if (activeQueue.length === 0) return
    if (activeQueue.length - lastSimilarQueueLengthRef.current >= 3) {
      lastSimilarQueueLengthRef.current = activeQueue.length
      setRefreshSimilarTrigger((n) => n + 1)
    }
  }, [activeQueue.length])

  // System messages dla dołączenia/wyjścia słuchaczy (tylko host wysyła)
  const prevListenersRef = useRef([])
  useEffect(() => {
    if (!inSession) { prevListenersRef.current = []; return }
    const prev = prevListenersRef.current
    const curr = sessionListeners
    if (isHost) {
      curr.forEach(l => {
        if (!prev.find(p => p.key === l.key))
          sendSystemMessage(`👤 ${l.nickname} dołączył do sesji`)
      })
      prev.forEach(l => {
        if (!curr.find(c => c.key === l.key))
          sendSystemMessage(`👤 ${l.nickname} opuścił sesję`)
      })
    }
    prevListenersRef.current = curr
  }, [sessionListeners]) // eslint-disable-line react-hooks/exhaustive-deps

  // Widoczność wiadomości systemowych (localStorage)
  const [showSystemMsgs, setShowSystemMsgs] = useState(
    () => localStorage.getItem('chat-show-sys') !== 'false'
  )

  // Chat — tick co sekundę gdy ktoś jest wyciszony (countdown)
  const [chatTick, setChatTick] = useState(0)
  useEffect(() => {
    const hasTimed = Object.values(chatMuted).some(m => !m.blocked && m.until && m.until > Date.now())
    if (!hasTimed) return
    const id = setInterval(() => setChatTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [chatMuted, chatTick])

  // Chat — auto-scroll i licznik nieprzeczytanych (ref zapobiega fałszywemu resetowi)
  const lastSeenChatCountRef = useRef(0)
  const lastSoundedChatCountRef = useRef(0)
  const myNicknameRef = useRef(myNickname)
  useEffect(() => { myNicknameRef.current = myNickname }, [myNickname])

  useEffect(() => {
    if (libraryView === 'chat') {
      lastSeenChatCountRef.current = chatMessages.length
      lastSoundedChatCountRef.current = chatMessages.length
      setChatUnread(0)
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setChatUnread(Math.max(0, chatMessages.length - lastSeenChatCountRef.current))
      if (chatMessages.length > lastSoundedChatCountRef.current) {
        const last = chatMessages[chatMessages.length - 1]
        if (last && !last.system && last.nick !== myNicknameRef.current) soundChatMsg()
        lastSoundedChatCountRef.current = chatMessages.length
      }
    }
  }, [chatMessages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset unread gdy otworzysz chat
  useEffect(() => {
    if (libraryView === 'chat') {
      lastSeenChatCountRef.current = chatMessages.length
      lastSoundedChatCountRef.current = chatMessages.length
      setChatUnread(0)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'instant' }), 50)
    }
  }, [libraryView]) // eslint-disable-line react-hooks/exhaustive-deps

  // Zakładka Podobne — ładuj rekomendacje lokalnie
  // Odświeża się tylko przy: kliknięciu zakładki LUB gdy kolejka urośnie o 3 (refreshSimilarTrigger)
  useEffect(() => {
    if (libraryView !== 'similar') return
    let cancelled = false
    setSimilarLoading(true)
    async function load() {
      try {
        if (mode === 'player') {
          const queue = localQueueRef.current
          const track = currentTrack
          // Bazuj na kolejce jeśli ma elementy, inaczej na aktualnym utworze
          const sourceItems = queue.length > 0 ? queue : (track ? [track] : [])
          if (sourceItems.length === 0) { if (!cancelled) setSimilarLoading(false); return }
          const queueIds = new Set(queue.map((i) => i.id))
          const allAuthors = [...new Set(sourceItems.map((i) => i.author).filter(Boolean))].slice(0, 3)
          const queries = [
            ...allAuthors.map((a) => `${a} best songs`),
            allAuthors[0] ? `artists like ${allAuthors[0]}` : null,
            track?.title ? `${track.title} similar` : null,
          ].filter(Boolean).slice(0, 3)
          const allResults = await Promise.all(
            queries.map((q) => window.playerBridge.searchYoutube(q).catch(() => []))
          )
          const seen = new Set([...(track ? [track.id] : []), ...queueIds])
          const merged = []
          for (const batch of allResults) {
            for (const t of (Array.isArray(batch) ? batch : [])) {
              if (!seen.has(t.id)) { seen.add(t.id); merged.push(t) }
            }
          }
          if (!cancelled) setSimilarItems(merged.slice(0, 30))
        } else if (mode === 'radio' && currentStation) {
          const tags = (currentStation.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
          if (tags.length === 0) {
            if (!cancelled) setSimilarItems([])
          } else {
            const allKnown = knownRadioStations.length > 0 ? knownRadioStations : stations
            const similar = allKnown
              .filter((s) => {
                if (s.id === currentStation.id) return false
                const sTags = (s.tags || '').split(',').map((t) => t.trim().toLowerCase())
                return tags.some((tag) => sTags.includes(tag))
              })
              .slice(0, 40)
            if (!cancelled) setSimilarItems(similar)
          }
        }
      } finally {
        if (!cancelled) setSimilarLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [libraryView, refreshSimilarTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pokaż modal gdy sesja zakończona z błędem
  useEffect(() => {
    if (togetherError) {
      soundSessionEnd()
      setSessionEndedMsg(togetherError)
    }
  }, [togetherError])

  // Dźwięk zmiany trybu
  const prevModeRef = useRef(null)
  useEffect(() => {
    if (prevModeRef.current === null) { prevModeRef.current = mode; return }
    if (mode === prevModeRef.current) return
    prevModeRef.current = mode
    if (mode === 'radio') soundSwitchRadio()
    else if (mode === 'player') soundSwitchPlayer()
  }, [mode])

  // Dźwięk dołączenia/wyjścia z sesji (tylko gdy w sesji)
  const prevListenerCountRef = useRef(null)
  useEffect(() => {
    if (!inSession) { prevListenerCountRef.current = null; return }
    if (prevListenerCountRef.current === null) { prevListenerCountRef.current = listenerCount; return }
    if (listenerCount > prevListenerCountRef.current) soundJoin()
    else if (listenerCount < prevListenerCountRef.current) soundLeave()
    prevListenerCountRef.current = listenerCount
  }, [listenerCount, inSession])

  // Dźwięk gdy dostaniemy nowe uprawnienie (gość)
  const prevPermsRef = useRef(null)
  useEffect(() => {
    if (!inSession || isHost) { prevPermsRef.current = null; return }
    const prev = prevPermsRef.current
    const curr = myPermissions
    if (prev !== null) {
      const gained = (!prev.canPlay && curr.canPlay) || (!prev.canSkip && curr.canSkip) || (!prev.canAdd && curr.canAdd)
      if (gained) soundPermission()
    }
    prevPermsRef.current = { ...curr }
  }, [myPermissions, inSession, isHost])

  // Dźwięk zatrzymania radia
  const prevRadioPlayingRef = useRef(null)
  useEffect(() => {
    if (prevRadioPlayingRef.current === null) { prevRadioPlayingRef.current = isRadioPlaying; return }
    if (prevRadioPlayingRef.current === true && isRadioPlaying === false) soundStop()
    prevRadioPlayingRef.current = isRadioPlaying
  }, [isRadioPlaying])

  // Dźwięk zatrzymania playera
  const prevTrackPlayingRef = useRef(null)
  useEffect(() => {
    if (prevTrackPlayingRef.current === null) { prevTrackPlayingRef.current = isTrackPlaying; return }
    if (prevTrackPlayingRef.current === true && isTrackPlaying === false) soundStop()
    prevTrackPlayingRef.current = isTrackPlaying
  }, [isTrackPlaying])

  function handleChatCommand(raw) {
    const parts = raw.trim().split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)
    const noPerms = () => showSessionToast('Brak uprawnień do tej komendy.')
    const hostOnly = () => showSessionToast('Tylko host może użyć tej komendy.')
    const isMod = isHost || (myPermissions.canPlay && myPermissions.canSkip && myPermissions.canAdd)

    switch (cmd) {
      case '/clear':
        if (!isHost) return hostOnly()
        clearChat()
        sendSystemMessage(`🗑️ ${myNickname} wyczyszcił czat`)
        return
      case '/next':
        if (!checkPerm('canSkip')) return noPerms()
        if (mode === 'radio') handleStationNext()
        else handleTrackNext(true)
        return
      case '/stop':
        if (!checkPerm('canPlay')) return noPerms()
        if (mode === 'radio') {
          audioRef.current?.pause()
          setIsRadioPlaying(false)
        } else {
          setIsTrackPlaying(false)
          if (inSession) notifyAction('playPause', { playing: false, mode: 'player' })
        }
        return
      case '/pause':
        if (!checkPerm('canPlay')) return noPerms()
        if (mode === 'radio') {
          audioRef.current?.pause()
          setIsRadioPlaying(false)
        } else {
          setIsTrackPlaying(false)
          if (inSession) notifyAction('playPause', { playing: false, mode: 'player' })
        }
        return
      case '/play':
        if (!checkPerm('canPlay')) return noPerms()
        if (mode === 'player') {
          setIsTrackPlaying(true)
          if (inSession) notifyAction('playPause', { playing: true, mode: 'player' })
        }
        return
      case '/mute': {
        if (!isHost) return hostOnly()
        const nick = args[0]
        const secs = parseInt(args[1]) || 30
        if (!nick) return showSessionToast('Użycie: /mute [nick] [sekundy]')
        muteChatUser(nick, secs)
        sendSystemMessage(`🔇 ${nick} został wyciszony na ${secs}s`)
        return
      }
      case '/unmute': {
        if (!isHost) return hostOnly()
        const nick = args[0]
        if (!nick) return showSessionToast('Użycie: /unmute [nick]')
        unblockChatUser(nick)
        sendSystemMessage(`🔊 ${nick} został odciszony`)
        return
      }
      case '/me': {
        if (!isMod) return noPerms()
        const text = args.join(' ')
        if (!text) return
        sendChatMessage(text, true)
        return
      }
      case '/msg': {
        const target = args[0]
        const text = args.slice(1).join(' ')
        if (!target || !text) return showSessionToast('Użycie: /msg [nick] [wiadomość]')
        sendChatMessage(text, false, target)
        return
      }
      case '/r': {
        const text = args.join(' ')
        if (!text) return showSessionToast('Użycie: /r [wiadomość]')
        if (!lastPmSenderRef.current) return showSessionToast('Brak ostatniego PM do odpowiedzi.')
        sendChatMessage(text, false, lastPmSenderRef.current)
        return
      }
      case '/vol': {
        const v = parseInt(args[0])
        if (isNaN(v) || v < 0 || v > 100) return showSessionToast('Użycie: /vol [0-100]')
        setVolumePercent(v)
        showSessionToast(`🔊 Głośność: ${v}%`)
        return
      }
      case '/queue':
        showSessionToast(`Kolejka: ${activeQueue.length} ${activeQueue.length === 1 ? 'utwór' : 'utworów'}`)
        return
      case '/sys':
        setShowSystemMsgs(v => {
          const next = !v
          localStorage.setItem('chat-show-sys', String(next))
          showSessionToast(next ? '✅ Wiadomości systemowe włączone' : '🚫 Wiadomości systemowe wyłączone')
          return next
        })
        return
      case '/help':
        showSessionToast('/clear /next /stop /pause /play /mute /unmute /me /msg /r /vol /queue /sys')
        return
      default:
        showSessionToast(`Nieznana komenda: ${cmd}. Wpisz /help po listę.`)
    }
  }

  return (
    <>
    {splashVisible && (
      <div className={`splash-screen${splashFading ? ' fading' : ''}`}>
        <div className="splash-inner">
          <h1 className="splash-title">Music App</h1>
          <p className="splash-sub">by MrPerru</p>
        </div>
      </div>
    )}
    <main className="app-shell">
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onPause={() => {
          setIsRadioPlaying(false)
          setIsRadioBuffering(false)
        }}
        onWaiting={() => {
          if (mode === 'radio') {
            setIsRadioBuffering(true)
          }
        }}
        onCanPlay={() => {
          if (mode === 'radio') {
            setIsRadioBuffering(false)
          }
        }}
        onPlay={() => {
          setIsRadioPlaying(true)
          setIsRadioBuffering(false)
        }}
        onError={() => {
          setIsRadioBuffering(false)
          if (mode === 'radio' && isRadioPlaying) {
            tryNextStationStream()
          }
        }}
      />

      <ReactPlayer
        ref={trackPlayerRef}
        src={resolvedTrackUrl}
        playing={mode === 'player' && isTrackPlaying && !!resolvedTrackUrl}
        controls={false}
        width="1px"
        height="1px"
        volume={effectiveVolume}
        muted={volumePercent === 0}
        playsInline
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
        config={{
          youtube: {
            playerVars: {
              controls: 0,
              rel: 0,
              modestbranding: 1,
              playsinline: 1,
            },
          },
        }}
        onReady={() => {
          setIsTrackReady(true)
          setTrackError('')
          if (pendingRemoteSeekRef.current !== null) {
            const t = pendingRemoteSeekRef.current
            pendingRemoteSeekRef.current = null
            const player = trackPlayerRef.current
            if (player) {
              if ('currentTime' in player) player.currentTime = t
              else player.seekTo?.(t, 'seconds')
            }
            setTrackTime(t)
          }
        }}
        onPlay={() => setIsTrackPlaying(true)}
        onPause={() => { if (isTrackReady) setIsTrackPlaying(false) }}
        onDurationChange={(duration) => setTrackDuration(Number(duration) || 0)}
        onEnded={() => {
          handleTrackNext(true)
        }}
        onError={() => {
          setTrackError('Ten utwór nie daje się odtworzyć. Wybierz inny z listy.')
          setIsTrackPlaying(false)
        }}
      />

      <header className="topbar">
        {/* Custom titlebar buttons */}
        <div className="win-controls">
          <button className={`win-btn win-settings${showSizePanel ? ' active' : ''}`} onClick={() => setShowSizePanel(v => !v)} title="Rozmiar okna">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <circle cx="6" cy="6" r="2"/>
              <path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.5 2.5l1 1M8.5 8.5l1 1M9.5 2.5l-1 1M3.5 8.5l-1 1"/>
            </svg>
          </button>
          <div className="win-controls-sep"/>
          <button className="win-btn win-min" onClick={() => window.playerBridge?.minimizeWindow()} title="Minimalizuj">
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1.5" rx="0.75" fill="currentColor"/></svg>
          </button>
          <button className="win-btn win-close" onClick={() => window.playerBridge?.closeWindow()} title="Zamknij">
            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="mode-notch">
          <div className="segmented-control notch">
            <button className={mode === 'radio' ? 'active' : ''} onClick={() => updateMode('radio')}>
              Radio
            </button>
            <button className={mode === 'player' ? 'active' : ''} onClick={() => updateMode('player')}>
              Player
            </button>
          </div>
        </div>

        <div className="topbar-main">
          <p className="eyebrow">Jeden player, dwa tryby,powered by MrPerru </p>
          <h1>{mode === 'radio' ? 'Radio' : 'Player'}</h1>
        </div>

        <div className="topbar-metrics">
          <span>{mode === 'radio' ? `${stations.length} stacji` : `${allTracks.length} utworów`}</span>
          <span>{favorites.length} ulubionych</span>
          <span>{mode === 'radio' ? 'Radio online' : 'Audio z YouTube'}</span>
          <button
            className={`together-btn${inSession ? ' active' : ''}`}
            onClick={() => setSessionModalOpen(v => !v)}
            title="Słuchaj razem"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
            {inSession && <span className="together-count">{listenerCount}</span>}
          </button>
          {mode === 'player' && (
            <button
              className={`together-btn${lyricsVisible ? ' active' : ''}`}
              onClick={() => setLyricsVisible(v => !v)}
              title="Tekst piosenki"
            >🎤</button>
          )}
          {inSession && (
            <button
              className={`together-btn game-btn${gameState === 'playing' ? ' active' : ''}`}
              onClick={() => gameState === 'playing' ? setMonopolyOpen(true) : setGameLobbyOpen(v => !v)}
              title="Monopoly"
            >🎲</button>
          )}
        </div>
      </header>


      <section className="content-grid">
        <article className="stage-card">
          <div className="stage-header">
            <div className="stage-main">
              <div className="cover-badge">
                <img
                  src={playerArt}
                  alt=""
                  onError={(event) => withFallbackArt(event, mode === 'radio' ? currentStation?.name : currentTrack?.title, mode)}
                />
                <span className="flag-badge">{playerFlag}</span>
              </div>

              <div>
                <p className="stage-label">Teraz leci</p>
                {shouldScrollTitle ? (
                  <div className="title-marquee">
                    <div className="title-track">
                      <span>{currentTitle}</span>
                      <span>{currentTitle}</span>
                    </div>
                  </div>
                ) : (
                  <p className="title-single-text">{currentTitle}</p>
                )}
                {mode === 'radio' && currentStation && (
                  <div className="radio-track-timeline">
                    <p className="stage-nowplaying">
                      {radioNowPlaying ? (
                        <>
                          Teraz gra: {radioNowPlaying}
                          {radioNowPlayingAt && (
                            <span className="nowplaying-time">
                              ({radioNowPlayingAt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })})
                            </span>
                          )}
                        </>
                      ) : 'Teraz gra: brak metadanych od stacji'}
                    </p>
                    {radioPlayHistory.length > 0 && (
                      <p className="radio-track-prev">
                        <span className="radio-track-prev-label">Wcześniej grało: </span>
                        {radioPlayHistory[0]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button className={isFavorite ? 'accent active' : 'accent'} onClick={toggleFavorite}>
              {isFavorite ? 'W ulubionych' : 'Dodaj do ulubionych'}
            </button>
          </div>

          <ElectricBorder
            colorBase="#a5a5a5b9"
            colorPeak="#ff6600"
            speed={(mode === 'radio' ? isRadioPlaying : isTrackPlaying) ? 0.15 : 0.08}
            speedMax={(mode === 'radio' ? isRadioPlaying : isTrackPlaying) ? 2.5 : 0.04}
            chaos={0.055}
            chaosMax={0.075}
            energyRef={electricEnergyRef}
            borderRadius={20}
            style={{ flex: 1, minHeight: 0, marginTop: 10 }}
          >
          <div className={`stage-visual ${mode}`} style={{ marginTop: 0 }}>
            <canvas ref={vizBgCanvasRef} className="viz-bg-canvas" />
            {(() => {
              const marqueeText = mode === 'radio'
                ? `${currentStation?.name || 'Radio'} • ${currentStation?.country || 'Online'} • ${currentStation?.tags || activeGenre.label}`
                : `${currentTrack?.title || 'Brak wybranego utworu'} • ${currentTrack?.author || 'YouTube'} • ${activeGenre.label}`
              const scroll = marqueeText.length > 42
              return (
                <div className="stage-marquee">
                  <div className={`marquee-track${scroll ? ' scrolling' : ''}`}>
                    <span>{scroll ? marqueeText + '   ·   ' : marqueeText}</span>
                    {scroll && <span>{marqueeText + '   ·   '}</span>}
                  </div>
                </div>
              )
            })()}

            <div className="radio-stage-body">
                <div ref={audioMotionContainerRef} className="audio-motion-viz" />
                {mode === 'player' && (
                  <div className={`player-idle-wave${isTrackPlaying ? ' hidden' : ''}`}>
                    {IDLE_BARS.map((h, i) => (
                      <div
                        key={i}
                        className="idle-bar"
                        style={{ height: `${h}%`, animationDelay: `${(i / 47 * 1.5).toFixed(2)}s` }}
                      />
                    ))}
                  </div>
                )}
                {mode === 'radio' && (
                  <div className={`player-idle-wave${isRadioPlaying ? ' hidden' : ''}`}>
                    {IDLE_BARS.map((h, i) => (
                      <div
                        key={i}
                        className="idle-bar"
                        style={{ height: `${h}%`, animationDelay: `${(i / 47 * 1.5).toFixed(2)}s` }}
                      />
                    ))}
                  </div>
                )}
                {mode === 'radio' && radioVisualizerStatus && (
                  <p className={isAlreadyOnStationStatus ? 'radio-viz-hint visible success' : 'radio-viz-hint visible'}>
                    {fallbackStationName ? (
                      <>
                        <span className="radio-viz-hint-line">
                          Radio <span className="radio-viz-hint-station">{fallbackStationName}</span> nie działa
                        </span>
                        <span className="radio-viz-hint-line secondary">Odpalamy stację podstawową</span>
                      </>
                    ) : radioVisualizerStatus}
                  </p>
                )}
                <LyricsOverlay
                  visible={lyricsVisible && mode === 'player'}
                  trackTitle={currentTrack?.title}
                  trackArtist={currentTrack?.author}
                  trackTime={trackTime}
                  trackDuration={trackDuration}
                  isPlaying={isTrackPlaying}
                  onSeek={(t) => {
                    setTrackTime(t)
                    const player = trackPlayerRef.current
                    if (!player) return
                    if ('currentTime' in player) player.currentTime = t
                    else if (player.seekTo) player.seekTo(t, 'seconds')
                  }}
                />
              </div>
            </div>
          </ElectricBorder>

          <div className="info-strip">
            {mode === 'radio' ? (
              <>
                <span>{countryFlagEmoji(currentStation?.countryCode)} {currentStation?.country || 'Online'}</span>
                <span>{(currentStation?.codec || 'STREAM').toUpperCase()} · {currentStation?.bitrate ? `${currentStation.bitrate} kbps` : 'Auto'}</span>
                {currentStation?.language ? <span>{currentStation.language}</span> : null}
                {currentStation?.votes > 0 ? <span>♥ {currentStation.votes > 999 ? `${(currentStation.votes / 1000).toFixed(1)}k` : currentStation.votes}</span> : null}
                {currentStation?.tags ? <span>{currentStation.tags.split(',')[0].trim()}</span> : null}
              </>
            ) : (
              <>
                {currentTrack ? (
                  <span>#{visibleTracks.findIndex((t) => t.id === currentTrack.id) + 1} / {visibleTracks.length}</span>
                ) : null}
                <span>{currentTrack?.duration || '—'}</span>
                <span>{currentTrack?.author || 'YouTube'}</span>
                {activeGenre.label !== 'Wszystkie' ? <span>{activeGenre.label}</span> : null}
                <span>{isTrackReady ? '● Gotowy' : '○ Ładowanie'}</span>
              </>
            )}
          </div>
        </article>

        <aside className="library-card">
          <div className="library-toolbar">
            <div className="segmented-control small">
              <button className={libraryView === 'all' ? 'active' : ''} onClick={() => setLibraryView('all')}>
                Wszystkie
              </button>
              <button className={libraryView === 'favorites' ? 'active' : ''} onClick={() => setLibraryView('favorites')}>
                ♥ Ulubione
              </button>
              <button className={`${libraryView === 'similar' ? 'active' : ''} similar-tab`} onClick={() => setLibraryView('similar')}>
                Podobne
              </button>
              {mode === 'player' && (
                <button className={`${libraryView === 'suggested' ? 'active' : ''} suggested-tab`} onClick={() => setLibraryView('suggested')}>
                  Kolejka
                  {activeQueue.length > 0 && <span className="suggested-badge">{activeQueue.length}</span>}
                </button>
              )}
              {inSession && (
                <button className={`${libraryView === 'chat' ? 'active' : ''} chat-tab`} onClick={() => setLibraryView('chat')}>
                  Chat
                  {chatUnread > 0 && <span className="chat-unread-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>}
                </button>
              )}
            </div>

            <span className="count-pill">
              {libraryView === 'similar'
                ? similarItems.length
                : mode === 'radio'
                  ? (radioGardenMode ? rgResults.length : filteredStations.length)
                  : libraryView === 'suggested'
                    ? activeQueue.length
                    : libraryView === 'chat'
                      ? chatMessages.length
                      : visibleTracks.length} pozycji
            </span>
          </div>

          <div className={`library-extras${(libraryView === 'chat' || libraryView === 'similar') ? ' library-extras--hidden' : ''}`}>
          {mode === 'player' ? (
            <>
              <div className="filters-panel">
                <button
                  className={`filters-toggle ${filtersOpen ? 'open' : ''}`}
                  onClick={() => setFiltersOpen((v) => !v)}
                >
                  <span>Filtry</span>
                  <span className="filters-badge">
                    {(() => {
                      let active = 0
                      if (filters.types.length < 4) active++
                      if (filters.duration !== 'all') active++
                      if (filters.era !== 'all') active++
                      if (filters.genres.length > 0) active++
                      if (filters.languages.length > 0) active++
                      return active > 0 ? `${active} aktywne` : 'Wszystkie'
                    })()}
                  </span>
                  <span className="filters-chevron">{filtersOpen ? '▲' : '▼'}</span>
                </button>

                {filtersOpen && (
                  <div className="filters-body">
                    <div className="filters-section">
                      <p className="filters-label">Gatunek</p>
                      <div className="filters-chips">
                        {FILTER_GENRES.map((g) => (
                          <button
                            key={g.id}
                            className={`filter-chip ${filters.genres.includes(g.id) ? 'active' : ''}`}
                            onClick={() => setFilters((f) => ({
                              ...f,
                              genres: f.genres.includes(g.id)
                                ? f.genres.filter((x) => x !== g.id)
                                : [...f.genres, g.id],
                            }))}
                          >{g.label}</button>
                        ))}
                      </div>
                    </div>

                    <div className="filters-section">
                      <p className="filters-label">Język</p>
                      <div className="filters-chips">
                        {FILTER_LANGUAGES.map((l) => (
                          <button
                            key={l.id}
                            className={`filter-chip ${filters.languages.includes(l.id) ? 'active' : ''}`}
                            onClick={() => setFilters((f) => ({
                              ...f,
                              languages: f.languages.includes(l.id)
                                ? f.languages.filter((x) => x !== l.id)
                                : [...f.languages, l.id],
                            }))}
                          >{l.label}</button>
                        ))}
                      </div>
                    </div>

                    <div className="filters-section">
                      <p className="filters-label">Typ materiału</p>
                      <div className="filters-chips">
                        {FILTER_TYPES.map((t) => (
                          <button
                            key={t.id}
                            className={`filter-chip type-chip ${filters.types.includes(t.id) ? 'active' : ''}`}
                            onClick={() => setFilters((f) => ({
                              ...f,
                              types: f.types.includes(t.id)
                                ? f.types.filter((x) => x !== t.id)
                                : [...f.types, t.id],
                            }))}
                          >{t.label}</button>
                        ))}
                      </div>
                    </div>

                    <div className="filters-row2">
                      <div className="filters-section">
                        <p className="filters-label">Długość</p>
                        <div className="filters-chips">
                          {FILTER_DURATIONS.map((d) => (
                            <button
                              key={d.id}
                              className={`filter-chip ${filters.duration === d.id ? 'active' : ''}`}
                              onClick={() => setFilters((f) => ({ ...f, duration: d.id }))}
                            >{d.label}</button>
                          ))}
                        </div>
                      </div>

                      <div className="filters-section">
                        <p className="filters-label">Era</p>
                        <div className="filters-chips">
                          {FILTER_ERAS.map((e) => (
                            <button
                              key={e.id}
                              className={`filter-chip ${filters.era === e.id ? 'active' : ''}`}
                              onClick={() => setFilters((f) => ({ ...f, era: e.id }))}
                            >{e.label}</button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="filters-actions">
                      <button
                        className="filters-apply"
                        onClick={() => {
                          setSearchResults([])
                          setSearchTerm('')
                          setCuratedTracksKey((k) => k + 1)
                          setFiltersOpen(false)
                        }}
                      >Zastosuj i wyszukaj</button>
                      <button
                        className="filters-reset"
                        onClick={() => setFilters(DEFAULT_FILTERS)}
                      >Resetuj</button>
                    </div>
                  </div>
                )}
              </div>
              <form className="search-panel" onSubmit={(e) => { setShowSuggestions(false); handleTrackSearch(e) }}>
                <label htmlFor="search">Szukaj pojedynczych utworów</label>
                <div className="search-row" style={{ position: 'relative' }}>
                  <input
                    id="search"
                    value={searchTerm}
                    onChange={(event) => { setSearchTerm(event.target.value); setShowSuggestions(true) }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="np. Pezet Dom nad wodą, Quebonafide, J Cole"
                    autoComplete="off"
                  />
                  <button type="submit" className="primary">Szukaj</button>
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="search-suggestions">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="suggestion-item"
                          onMouseDown={() => {
                            setSearchTerm(s.title)
                            setShowSuggestions(false)
                          }}
                        >
                          <span className="suggestion-title">{s.title}</span>
                          <span className="suggestion-author">{s.author}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </form>
            </>
          ) : (
            <div className="radio-filters">
              <div className="country-filter">
                <label htmlFor="country-filter">Kraj stacji</label>
                <select
                  id="country-filter"
                  value={countryFilter}
                  onChange={(event) => setCountryFilter(event.target.value)}
                >
                  <option value="ALL">Wszystkie kraje</option>
                  {countryOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="radio-genre-filter">
                <label>Gatunek</label>
                <div className="radio-genre-chips">
                  {RADIO_GENRES.map((g) => (
                    <button
                      key={g.id}
                      className={radioTagFilter === g.id ? 'filter-chip active' : 'filter-chip'}
                      onClick={() => setRadioTagFilter(g.id)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="library-header">
            <div>
              <p className="stage-label">Lista źródeł</p>
              <h3>{mode === 'radio' ? 'Stacje' : 'Utwory'}</h3>
            </div>
            {mode === 'radio' ? (
              <div className="station-search">
                <input
                  type="text"
                  value={stationSearchTerm}
                  onChange={(event) => setStationSearchTerm(event.target.value)}
                  placeholder={radioGardenMode ? '🌍 Szukaj stacji...' : 'Szukaj stacji...'}
                />
                <button
                  className={`rg-toggle-btn${radioGardenMode ? ' active' : ''}`}
                  onClick={() => { setRadioGardenMode(v => !v); setRgResults([]); setStationSearchTerm('') }}
                  title="Radio Garden — stacje z całego świata"
                >🌍</button>
                {radioGardenMode && (
                  <select className="rg-country-inline" value={rgCountry} onChange={e => setRgCountry(e.target.value)}>
                    <option value="">🌍 Wszystkie</option>
                    <option value="PL">🇵🇱 PL</option>
                    <option value="US">🇺🇸 US</option>
                    <option value="GB">🇬🇧 GB</option>
                    <option value="DE">🇩🇪 DE</option>
                    <option value="FR">🇫🇷 FR</option>
                    <option value="ES">🇪🇸 ES</option>
                    <option value="IT">🇮🇹 IT</option>
                    <option value="BR">🇧🇷 BR</option>
                    <option value="JP">🇯🇵 JP</option>
                    <option value="TR">🇹🇷 TR</option>
                    <option value="RU">🇷🇺 RU</option>
                    <option value="UA">🇺🇦 UA</option>
                    <option value="SE">🇸🇪 SE</option>
                    <option value="NL">🇳🇱 NL</option>
                    <option value="AU">🇦🇺 AU</option>
                  </select>
                )}
              </div>
            ) : null}
          </div>

          {trackError && mode === 'player' ? <p className="status-copy error">{trackError}</p> : null}
          </div>

          <div className={`library-list${libraryView === 'chat' ? ' library-list--chat' : ''}`}>
            {mode === 'radio' && radioGardenMode && (
              rgLoading
                ? Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="library-item skeleton" style={{ animationDelay: `${i * 0.06}s`, opacity: 0, animation: `fadeIn 0.3s ease ${i * 0.06}s forwards` }}>
                      <div className="skeleton-art" /><div className="skeleton-copy"><div className="skeleton-line wide" /><div className="skeleton-line narrow" /></div>
                    </div>
                  ))
                : rgResults.length === 0
                  ? <div className="empty-state">{stationSearchTerm ? 'Brak wyników' : 'Wpisz nazwę stacji lub miasta...'}</div>
                  : rgResults.map(s => {
                      const selected = currentStation?.id === s.id
                      return (
                        <div
                          key={s.id}
                          className={`library-item${selected ? ' active' : ''}`}
                          onClick={() => handleRgPick(s)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="item-art with-badge">
                            <img src={safeArt(s.favicon, s.name, 'radio')} alt="" onError={e => withFallbackArt(e, s.name, 'radio')} />
                            <span className="item-flag">{countryFlagEmoji(s.countryCode)}</span>
                          </div>
                          <div className="item-copy">
                            <span className="item-title">{s.name}</span>
                            <span className="item-meta">{s.country}{s.tags ? ` · ${s.tags.split(',').slice(0,2).join(', ')}` : ''}</span>
                          </div>
                        </div>
                      )
                    })
            )}
            {libraryView !== 'chat' && libraryView !== 'similar' && !(mode === 'radio' && radioGardenMode) && (mode === 'radio' ? radioLoading : trackLoading) && (mode === 'radio' ? filteredStations : visibleTracks).length === 0
              ? Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="library-item skeleton" style={{ animationDelay: `${i * 0.06}s`, opacity: 0, animation: `fadeIn 0.3s ease ${i * 0.06}s forwards` }}>
                    <div className="skeleton-art" />
                    <div className="skeleton-copy">
                      <div className="skeleton-line wide" style={{ animationDelay: `${i * 0.06}s` }} />
                      <div className="skeleton-line narrow" style={{ animationDelay: `${i * 0.06 + 0.1}s` }} />
                    </div>
                  </div>
                ))
              : null}
            {libraryView === 'similar' ? (
              similarLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="library-item skeleton" style={{ animationDelay: `${i * 0.06}s`, opacity: 0, animation: `fadeIn 0.3s ease ${i * 0.06}s forwards` }}>
                    <div className="skeleton-art" />
                    <div className="skeleton-copy">
                      <div className="skeleton-line wide" style={{ animationDelay: `${i * 0.06}s` }} />
                      <div className="skeleton-line narrow" style={{ animationDelay: `${i * 0.06 + 0.1}s` }} />
                    </div>
                  </div>
                ))
              ) : similarItems.length === 0 ? (
                <div className="empty-state">
                  {mode === 'player' && !currentTrack ? 'Włącz jakiś utwór, żeby zobaczyć podobne.' : mode === 'radio' && !currentStation ? 'Włącz stację, żeby zobaczyć podobne.' : 'Brak podobnych wyników.'}
                </div>
              ) : similarItems.map((item) => (
                <div
                  key={item.id}
                  className={`library-item${(mode === 'player' ? currentTrack?.id : currentStation?.id) === item.id ? ' active' : ''}`}
                  onClick={() => mode === 'player' ? selectTrack(item, true, inSession) : selectStation(item)}
                >
                  <div className="item-art with-badge">
                    <img
                      src={mode === 'player' ? safeArt(item.thumbnail, item.title, 'track') : safeArt(item.favicon, item.name, 'radio')}
                      alt=""
                      onError={(e) => withFallbackArt(e, mode === 'player' ? item.title : item.name, mode === 'player' ? 'track' : 'radio')}
                    />
                    <span className="flag-badge small">{mode === 'player' ? 'YT' : countryFlagEmoji(item.countryCode)}</span>
                  </div>
                  <div className="item-copy">
                    <strong>{mode === 'player' ? item.title : item.name}</strong>
                    <span>{mode === 'player' ? item.author : item.tags?.split(',').slice(0, 2).join(', ')}</span>
                  </div>
                  {mode === 'player' && <span className="item-duration">{item.duration}</span>}
                </div>
              ))
            ) : libraryView === 'suggested' && mode === 'player' ? (
              activeQueue.length === 0 ? (
                <div className="empty-state">Kolejka jest pusta — dodaj utwory przyciskiem + przy każdym utworze.</div>
              ) : activeQueue.map((item) => (
                <div key={item.key} className="library-item suggestion-item">
                  <div className="item-art with-badge">
                    <img
                      src={safeArt(item.thumbnail, item.title, 'track')}
                      alt=""
                      onError={(event) => withFallbackArt(event, item.title, 'track')}
                    />
                    <span className="flag-badge small">YT</span>
                  </div>
                  <div className="item-copy">
                    <strong>{item.title}</strong>
                    <span>{item.author}</span>
                  </div>
                  <div className="suggestion-actions">
                    <button
                      className="suggestion-play-btn"
                      title="Odtwórz teraz"
                      onClick={() => { selectTrack(item); removeFromQueue(item.key) }}
                    >▶</button>
                    <button
                      className="suggestion-remove-btn"
                      title="Usuń z kolejki"
                      onClick={() => removeFromQueue(item.key)}
                    >✕</button>
                  </div>
                </div>
              ))
            ) : libraryView === 'chat' ? (
              <div className="chat-panel">
                <div className="chat-messages">
                  {chatMessages.length === 0 && (
                    <div className="empty-state">Brak wiadomości — napisz coś!</div>
                  )}
                  {chatMessages.map((msg) => {
                    if (msg.system && !showSystemMsgs) return null
                    const time = new Date(msg.sentAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })

                    // Wiadomość systemowa
                    if (msg.system) {
                      return (
                        <div key={msg.key} className="chat-msg-system">
                          <span className="chat-msg-system-text">{msg.text}</span>
                          <span className="chat-msg-time">{time}</span>
                        </div>
                      )
                    }

                    // Prywatna wiadomość — widoczna tylko dla nadawcy, odbiorcy i hosta
                    if (msg.pmTo) {
                      const pmVisible = isHost || msg.nick === myNickname || msg.pmTo === myNickname
                      if (!pmVisible) return null
                      if (msg.pmTo === myNickname && msg.nick !== myNickname) lastPmSenderRef.current = msg.nick
                      const pmIsMe = msg.nick === myNickname
                      return (
                        <div key={msg.key} className={`chat-msg-pm${pmIsMe ? ' chat-msg-pm-out' : ''}`}>
                          <div className="chat-msg-header">
                            <span className="chat-pm-label">{pmIsMe ? `PM → ${msg.pmTo}` : `PM ← ${msg.nick}`}</span>
                            <span className="chat-msg-time">{time}</span>
                          </div>
                          <span className="chat-msg-text">{renderChatText(msg.text)}</span>
                        </div>
                      )
                    }

                    // Wiadomość /me (akcja)
                    if (msg.me) {
                      return (
                        <div key={msg.key} className="chat-msg-action">
                          <span className="chat-action-text">* {msg.nick} {msg.text}</span>
                          <span className="chat-msg-time">{time}</span>
                        </div>
                      )
                    }

                    // Zwykła wiadomość
                    const isMe = msg.nick === myNickname
                    const isFromHost = msg.nick === hostNick
                    const listener = sessionListeners.find(l => l.nickname === msg.nick)
                    const isMod = !isFromHost && listener && listener.canPlay && listener.canSkip && listener.canAdd
                    const safeNick = msg.nick?.replace(/[.#$[\]]/g, '_')
                    const muteEntry = chatMuted[safeNick]
                    const isMuted = muteEntry && (muteEntry.blocked || (muteEntry.until && muteEntry.until > Date.now()))
                    const muteSecsLeft = muteEntry && !muteEntry.blocked && muteEntry.until
                      ? Math.max(0, Math.ceil((muteEntry.until - Date.now()) / 1000))
                      : 0
                    return (
                      <div key={msg.key} className={`chat-msg${isMe ? ' chat-msg-me' : ''}${msg.deleted ? ' chat-msg-deleted' : ''}`}>
                        <div className="chat-msg-header">
                          {(isFromHost || isMod) && (
                            <span className={`chat-role-badge ${isFromHost ? 'chat-role-host' : 'chat-role-mod'}`}>
                              {isFromHost ? 'HOST' : 'MOD'}
                            </span>
                          )}
                          <span className="chat-msg-nick">{isMe ? 'Ty' : msg.nick}</span>
                          {isMuted && (
                            <span className="chat-muted-badge" title={muteEntry.blocked ? 'Zablokowany' : `Wyciszony: ${muteSecsLeft}s`}>
                              {muteEntry.blocked ? '🚫' : `⏱${muteSecsLeft}s`}
                            </span>
                          )}
                          <span className="chat-msg-time">{time}</span>
                        </div>
                        <span className="chat-msg-text">
                          {msg.deleted ? <em className="chat-deleted-text">Usunięte przez hosta</em> : renderChatText(msg.text)}
                        </span>
                        {isHost && !isMe && !msg.deleted && (
                          <div className="chat-mod-actions">
                            <button className="chat-mod-btn chat-mod-delete" title="Usuń wiadomość" onClick={() => deleteChatMsg(msg.key)}>✕</button>
                            {isMuted ? (
                              <button className="chat-mod-btn chat-mod-unmute" title="Odblokuj" onClick={() => unblockChatUser(msg.nick)}>🔊 Odblokuj</button>
                            ) : (
                              <>
                                <button className="chat-mod-btn" title="Wycisz 10s" onClick={() => muteChatUser(msg.nick, 10)}>⏱ 10s</button>
                                <button className="chat-mod-btn" title="Wycisz 30s" onClick={() => muteChatUser(msg.nick, 30)}>⏱ 30s</button>
                                <button className="chat-mod-btn chat-mod-block" title="Zablokuj całkowicie" onClick={() => blockChatUser(msg.nick)}>🚫 Blokuj</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div ref={chatEndRef} />
                </div>
                {(() => {
                  const myKey = myNickname.replace(/[.#$[\]]/g, '_')
                  const myMute = chatMuted[myKey]
                  const blocked = myMute?.blocked
                  const secsLeft = myMute?.until ? Math.max(0, Math.ceil((myMute.until - Date.now()) / 1000)) : 0
                  const timedOut = secsLeft > 0
                  if (blocked) return <div className="chat-muted-info">🚫 Zostałeś zablokowany przez hosta.</div>
                  if (timedOut) return <div className="chat-muted-info">⏱ Wyciszony przez hosta — jeszcze {secsLeft}s.</div>
                  return (
                    <div className="chat-input-area">
                      {cmdSuggestions.length > 0 && (
                        <div className="chat-cmd-list" ref={cmdListRef}>
                          {cmdSuggestions.map((s, i) => (
                            <div
                              key={s.nick ? s.name : s.cmd}
                              className={`chat-cmd-item${i === cmdSuggestIdx ? ' active' : ''}${s.nick ? ' chat-cmd-nick-item' : ''}`}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                if (s.nick) {
                                  const p = chatInput.trim().split(/\s+/)
                                  setChatInput(`${p[0]} ${s.name} `)
                                } else {
                                  setChatInput(s.argHint ? s.cmd + ' ' : s.cmd)
                                }
                                setCmdSuggestions([])
                                setCmdSuggestIdx(0)
                              }}
                            >
                              {s.nick ? (
                                <>
                                  <span className="cmd-nick-icon">👤</span>
                                  <span className="cmd-nick-name">{s.name}</span>
                                </>
                              ) : (
                                <>
                                  <span className="cmd-name">{s.cmd}</span>
                                  {s.argHint && <span className="cmd-arg">{s.argHint}</span>}
                                  <span className="cmd-desc">{s.desc}</span>
                                  <span className={`cmd-role cmd-role-${s.role}`}>{s.role === 'host' ? 'HOST' : s.role === 'mod' ? 'MOD' : ''}</span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="chat-input-row">
                        <input
                          className={`chat-input${chatInput.startsWith('/') ? ' chat-input-cmd' : ''}`}
                          type="text"
                          placeholder="Wiadomość lub /komenda..."
                          maxLength={300}
                          value={chatInput}
                          onChange={(e) => {
                            const val = e.target.value
                            setChatInput(val)
                            const parts = val.split(/\s+/)
                            const cmd = parts[0]?.toLowerCase()
                            // Autocomplete nicku po /msg
                            if (cmd === '/msg' && val.includes(' ')) {
                              const prefix = (parts[1] || '').toLowerCase()
                              const nicks = [...sessionListeners.map(l => l.nickname), hostNick]
                                .filter(n => n && n !== myNickname && n.toLowerCase().startsWith(prefix))
                              setCmdSuggestions(nicks.map(n => ({ nick: true, name: n })))
                              setCmdSuggestIdx(0)
                              return
                            }
                            // Autocomplete komend (brak spacji)
                            if (val.startsWith('/') && !val.includes(' ')) {
                              const filtered = CHAT_COMMANDS.filter(c => c.cmd.startsWith(val.toLowerCase()))
                              setCmdSuggestions(filtered)
                              setCmdSuggestIdx(0)
                            } else {
                              setCmdSuggestions([])
                            }
                          }}
                          onKeyDown={(e) => {
                            // Nawigacja po liście komend
                            if (cmdSuggestions.length > 0) {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault()
                                const next = (cmdSuggestIdx + 1) % cmdSuggestions.length
                                setCmdSuggestIdx(next)
                                cmdListRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
                                return
                              }
                              if (e.key === 'ArrowUp') {
                                e.preventDefault()
                                const next = (cmdSuggestIdx - 1 + cmdSuggestions.length) % cmdSuggestions.length
                                setCmdSuggestIdx(next)
                                cmdListRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
                                return
                              }
                              if (e.key === 'Tab' || e.key === 'Enter') {
                                e.preventDefault()
                                const s = cmdSuggestions[cmdSuggestIdx]
                                if (s.nick) {
                                  const p = chatInput.trim().split(/\s+/)
                                  setChatInput(`${p[0]} ${s.name} `)
                                } else {
                                  setChatInput(s.argHint ? s.cmd + ' ' : s.cmd)
                                }
                                setCmdSuggestions([])
                                setCmdSuggestIdx(0)
                                return
                              }
                              if (e.key === 'Escape') { setCmdSuggestions([]); return }
                            }
                            // Tab dla uzupełniania nicku (/mute, /unmute)
                            if (e.key === 'Tab') {
                              e.preventDefault()
                              const parts = chatInput.trim().split(/\s+/)
                              const cmd = parts[0]?.toLowerCase()
                              if (['/mute', '/unmute'].includes(cmd) && sessionListeners.length > 0) {
                                const prefix = (parts[1] || '').toLowerCase()
                                const nicks = sessionListeners.map(l => l.nickname)
                                const matching = nicks.filter(n => n.toLowerCase().startsWith(prefix))
                                if (matching.length === 0) return
                                const idx = matching.indexOf(parts[1] ?? '')
                                const next = matching[(idx + 1) % matching.length]
                                setChatInput(`${cmd} ${next}${parts.slice(2).length ? ' ' + parts.slice(2).join(' ') : ''}`)
                              }
                              return
                            }
                            // Wyślij
                            if (e.key === 'Enter' && chatInput.trim()) {
                              if (chatInput.startsWith('/')) handleChatCommand(chatInput)
                              else sendChatMessage(chatInput)
                              setChatInput('')
                              setCmdSuggestions([])
                            }
                          }}
                          onBlur={() => setTimeout(() => setCmdSuggestions([]), 120)}
                        />
                        <button
                          className="chat-send-btn"
                          disabled={!chatInput.trim()}
                          onClick={() => {
                            if (chatInput.startsWith('/')) handleChatCommand(chatInput)
                            else sendChatMessage(chatInput)
                            setChatInput('')
                            setCmdSuggestions([])
                          }}
                        >{chatInput.startsWith('/') ? 'Wykonaj' : 'Wyślij'}</button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (mode === 'radio' && radioGardenMode) ? null : (mode === 'radio' ? filteredStations.slice(0, visibleStationCount) : visibleTracks.slice(0, visibleTrackCount)).map((item) => {
              const selected = mode === 'radio' ? currentStation?.id === item.id : currentTrack?.id === item.id
              const flag = mode === 'radio' ? countryFlagEmoji(item.countryCode) : 'YT'
              const art = mode === 'radio'
                ? safeArt(item.favicon, item.name, 'radio')
                : safeArt(item.thumbnail, item.title, 'track')
              const canSuggest = mode === 'player'

              return (
                <div
                  key={item.id}
                  ref={selected && mode === 'player' ? activeTrackRef : null}
                  className={`library-item${selected ? ' active' : ''}${canSuggest ? ' with-suggest' : ''}`}
                  onClick={() => {
                    if (mode === 'radio') {
                      if (!checkPerm('canSkip') && !checkPerm('canAdd')) return
                      selectStation(item)
                      if (inSession) notifyAction('stationChange', { id: item.id ?? '', name: item.name ?? '', url: item.url ?? '', country: item.country ?? '', countrycode: item.countrycode ?? '', favicon: item.favicon ?? '', tags: item.tags ?? '', codec: item.codec ?? '', bitrate: item.bitrate ?? 0, lastSong: item.lastSong ?? '' })
                      return
                    }
                    if (!checkPerm('canAdd')) return
                    selectTrack(item, true, true)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="item-art with-badge">
                    <img
                      src={art}
                      alt=""
                      onError={(event) => withFallbackArt(event, mode === 'radio' ? item.name : item.title, mode === 'radio' ? 'radio' : 'track')}
                    />
                    <span className="flag-badge small">{flag}</span>
                  </div>
                  <div className="item-copy">
                    <strong>{mode === 'radio' ? item.name : item.title}</strong>
                    <span>
                      {mode === 'radio'
                        ? [item.country, item.codec, item.votes ? `${item.votes} głosów` : ''].filter(Boolean).join(' • ')
                        : [item.author, item.duration].filter(Boolean).join(' • ')}
                    </span>
                  </div>
                  {canSuggest && (
                    <button
                      className={`suggest-btn${suggestedIds.has(item.id) ? ' done' : ''}`}
                      title={suggestedIds.has(item.id) ? 'Już zasugerowałeś' : 'Zasugeruj hostowi'}
                      onClick={(e) => { e.stopPropagation(); if (!suggestedIds.has(item.id)) handleSuggest(item) }}
                    >{suggestedIds.has(item.id) ? '✓' : '+'}</button>
                  )}
                </div>
              )
            })}

            {mode === 'radio' && filteredStations.length > visibleStationCount && (
              <div ref={stationListSentinelRef} style={{ height: 1 }} />
            )}
            {mode === 'player' && visibleTracks.length > visibleTrackCount && (
              <div ref={trackListSentinelRef} style={{ height: 1 }} />
            )}

            {libraryView !== 'chat' && libraryView !== 'similar' && !(mode === 'radio' && radioGardenMode) && libraryView !== 'suggested' && (mode === 'radio' ? filteredStations : visibleTracks).length === 0 ? (
              <div className="empty-state">
                {libraryView === 'favorites'
                  ? 'Brak ulubionych w tym trybie.'
                  : mode === 'radio'
                    ? stationSearchTerm.trim()
                      ? 'Brak stacji dla wpisanej frazy.'
                      : 'Brak stacji dla wybranego kraju.'
                    : 'Brak utworów dla tej frazy.'}
              </div>
            ) : null}

            {mode === 'player' && libraryView === 'all' && trackHistory.length > 0 ? (
              <div className="previous-section">
                <button
                  className="history-toggle"
                  onClick={() => setHistoryExpanded((v) => !v)}
                >
                  <span>Historia odtwarzania ({trackHistory.length})</span>
                  <span className="history-chevron">{historyExpanded ? '▲' : '▼'}</span>
                </button>
                {historyExpanded && trackHistory.map((entry) => (
                  <button
                    key={`hist-${entry.track.id}-${entry.ts}`}
                    className="library-item previous"
                    onClick={() => { if (!checkPerm('canAdd')) return; selectTrack(entry.track, true, true) }}
                  >
                    <div className="item-art with-badge">
                      <img
                        src={safeArt(entry.track.thumbnail, entry.track.title, 'track')}
                        alt=""
                        onError={(event) => withFallbackArt(event, entry.track.title, 'track')}
                      />
                      <span className="flag-badge small">YT</span>
                    </div>
                    <div className="item-copy">
                      <strong>{entry.track.title}</strong>
                      <span>{[entry.track.author, entry.track.duration].filter(Boolean).join(' • ')}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      </section>

      <footer className="bottom-player">
        <div className="bottom-nowplaying">
          <img
            src={playerArt}
            alt=""
            onError={(event) => withFallbackArt(event, mode === 'radio' ? currentStation?.name : currentTrack?.title, mode)}
          />
          <div className="bottom-nowcopy">
            <p className="bottom-label">Teraz odtwarzasz</p>
            {shouldScrollTitle ? (
              <div className="title-marquee compact">
                <div className="title-track">
                  <span>{currentTitle}</span>
                  <span>{currentTitle}</span>
                </div>
              </div>
            ) : (
              <p className="title-single-text compact">{currentTitle}</p>
            )}
          </div>
        </div>

        <div className="bottom-center">
          <div className="bottom-controls">
            {mode === 'player' ? (
              <button className="player-button ghost" onClick={() => handleTrackPrevious(isTrackPlaying)}>
                Poprzednie
              </button>
            ) : null}

            <button className="player-button ghost" onClick={handlePlayPause}>
              {mode === 'radio'
                ? isRadioPlaying
                  ? 'Pause'
                  : 'Play'
                : isTrackPlaying
                  ? 'Pause'
                  : 'Play'}
            </button>

            {mode === 'radio' ? (
              <button className="player-button primary" onClick={handleStationNext} disabled={inSession && !isHost && !myPermissions.canSkip}>Nastepne</button>
            ) : (
              <>
                <button className="player-button primary" onClick={() => handleTrackNext(isTrackPlaying)}>
                  {loadingMoreTracks ? 'Ladowanie...' : 'Dalej'}
                </button>
                <button className="player-button ghost" onClick={pickRandomTrack}>Losuj</button>
              </>
            )}
          </div>

          {mode === 'radio' ? (
            <div className={`live-progress${isRadioPlaying ? ' playing' : ' paused'}`} aria-label="Radio live">
              <div className="live-progress-track">
                <div className="live-progress-fill"></div>
                <span className="live-progress-dot"></span>
              </div>
              <span className="live-pill">{isRadioPlaying ? 'LIVE' : 'STOP'}</span>
            </div>
          ) : (() => {
            const dur = Math.max(trackDuration || currentTrack?.seconds || 0, 1)
            const pct = Math.min(100, (Math.min(trackTime, dur) / dur) * 100).toFixed(3)
            return (
              <div className="bottom-track">
                <span ref={seekTimeDisplayRef}>{formatSeconds(trackTime)}</span>
                <div className={`track-slider-wrap${isSeeking ? ' seeking' : ''}`}>
                  <div ref={seekFillRef} className="track-slider-fill" style={{ '--pct': `${pct}%` }} />
                  <div ref={seekThumbRef} className="track-slider-thumb" style={{ '--pct': `${pct}%` }} />
                  <input
                    className="track-slider-input"
                    type="range"
                    min="0"
                    max={dur}
                    step="1"
                    value={Math.min(trackTime, dur)}
                    disabled={inSession && !isHost && !myPermissions.canPlay}
                    onChange={handleSeekTrack}
                    onMouseDown={() => { isSeekingRef.current = true; setIsSeeking(true) }}
                    onMouseUp={handleSeekCommit}
                    onTouchStart={() => { isSeekingRef.current = true; setIsSeeking(true) }}
                    onTouchEnd={handleSeekCommit}
                  />
                </div>
                <span>{formatSeconds(dur)}</span>
              </div>
            )
          })()}
        </div>

        <div className="volume-control">
          <button
            className="volume-icon-btn"
            onClick={() => setVolumePercent((v) => {
              if (v === 0) return lastVolumeBeforeMuteRef.current
              lastVolumeBeforeMuteRef.current = v
              return 0
            })}
            aria-label={volumePercent === 0 ? 'Włącz dźwięk' : 'Wycisz'}
            title={volumePercent === 0 ? 'Włącz dźwięk' : 'Wycisz'}
          >
            {volumePercent === 0 ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 19L19 20.27 20.27 19 5.27 4 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
            ) : volumePercent < 40 ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            )}
          </button>
          <div className="volume-slider-wrap">
            <div ref={volumeFillRef} className="volume-slider-fill" style={{ '--pct': `${volumePercent}%` }} />
            <div ref={volumeThumbRef} className="volume-slider-thumb" style={{ '--pct': `${volumePercent}%` }} />
            <input
              className="volume-slider-input"
              type="range"
              min="0"
              max="100"
              step="1"
              value={volumePercent}
              onChange={handleVolumeChange}
              onMouseUp={handleVolumeCommit}
              onTouchEnd={handleVolumeCommit}
            />
          </div>
          <span ref={volumeLabelRef} className="volume-label">{volumePercent}%</span>
        </div>

      </footer>

      {sessionToast && (
        <div className="session-toast">{sessionToast}</div>
      )}

      {sessionModalOpen && (
        <div className="together-overlay" onClick={e => { if (e.target === e.currentTarget) setSessionModalOpen(false) }}>
          <div className="together-modal">
            <button className="together-modal-close" onClick={() => setSessionModalOpen(false)}>✕</button>
            <h2>Słuchaj razem</h2>

            {!inSession ? (
              <>
                <div className="together-nickname-row">
                  <label className="together-nickname-label">Twój nick</label>
                  <input
                    className="together-nickname-input"
                    placeholder="Wpisz swój nick..."
                    value={myNickname}
                    onChange={e => {
                      setMyNickname(e.target.value)
                      localStorage.setItem('together-nickname', e.target.value)
                    }}
                    maxLength={20}
                  />
                </div>

                <button
                  className="together-modal-create"
                  onClick={() => { soundCreateSession(); createSession() }}
                  disabled={togetherLoading}
                >
                  {togetherLoading ? 'Tworzenie...' : 'Utwórz sesję'}
                </button>

                <div className="together-divider">lub dołącz</div>

                <div className="together-join-row">
                  <input
                    className="together-code-input"
                    placeholder="Wpisz kod (np. XK7F2)"
                    value={joinCodeInput}
                    onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && joinSession(joinCodeInput)}
                    maxLength={6}
                  />
                  <button
                    className="together-join-btn"
                    onClick={() => joinSession(joinCodeInput)}
                    disabled={togetherLoading || joinCodeInput.length < 4}
                  >
                    {togetherLoading ? 'Dołączanie...' : 'Dołącz'}
                  </button>
                </div>

                {togetherError && <p className="together-error">{togetherError}</p>}
              </>
            ) : (
              <>
                <div className="together-session-info">
                  {isHost ? (
                    <>
                      <p className="together-label">Twój kod sesji</p>
                      <div className="together-code-display">
                        {sessionCode}
                      </div>
                      <button
                        className={`together-copy-btn${codeCopied ? ' copied' : ''}`}
                        onClick={handleCopyCode}
                        title={codeCopied ? 'Skopiowano!' : 'Kopiuj kod'}
                      >
                        {codeCopied
                          ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Skopiowano!</>
                          : <><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> Kopiuj</>
                        }
                      </button>
                      <p className="together-listeners">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                        {listenerCount} {listenerCount === 1 ? 'osoba słucha' : 'osoby słuchają'}
                      </p>

                      {sessionListeners.length > 0 && (
                        <div className="together-listeners-list">
                          <p className="together-perm-header">Uprawnienia słuchaczy</p>
                          {sessionListeners.map(l => {
                            const isMod = l.canPlay && l.canSkip && l.canAdd
                            return (
                              <div key={l.key} className="together-listener-row">
                                <span className="together-listener-nick">{l.nickname}</span>
                                <button
                                  className={`together-perm-btn ${isMod ? 'active' : ''}`}
                                  onClick={() => setModerator(l.key, !isMod)}
                                >
                                  {isMod ? '★ Moderator' : '☆ Moderator'}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="together-label">Połączono z sesją</p>
                      <div className="together-code-display">{sessionCode}</div>
                      <p className="together-listeners">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                        {listenerCount} {listenerCount === 1 ? 'osoba słucha' : 'osoby słuchają'}
                      </p>
                      <div className="together-my-perms">
                        <p className="together-perm-header">Twoje uprawnienia</p>
                        <div className="together-perm-status-row">
                          {myPermissions.canPlay && myPermissions.canSkip && myPermissions.canAdd
                            ? <span className="together-perm-status on">★ Moderator</span>
                            : <span className="together-perm-status off">Brak uprawnień</span>
                          }
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <button className="together-leave-btn" onClick={leaveSession}>
                  {isHost ? 'Zakończ sesję' : 'Opuść sesję'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>

    {updateInfo?.hasUpdate && (
      <UpdateModal
        updateInfo={updateInfo}
        onDismiss={() => setUpdateInfo(null)}
      />
    )}

    {versionPopupOpen && (
      <VersionPopup version={appVersion} history={versionHistory} onClose={() => setVersionPopupOpen(false)} />
    )}

    {appVersion && (
      <button className="app-version-badge" onClick={() => setVersionPopupOpen(true)}>
        v{appVersion}
      </button>
    )}

    {sessionEndedMsg && (() => {
      const hasDetails = sessionEndedMsg.includes('\n')
      const [mainMsg, ...detailParts] = sessionEndedMsg.split('\n')
      const details = detailParts.join('\n')
      const copyText = `[OnePlayer - błąd sesji]\n${sessionEndedMsg}\nWersja: ${appVersion}\nCzas: ${new Date().toLocaleString('pl-PL')}`
      return (
        <div className="session-ended-overlay">
          <div className="session-ended-modal">
            <div className="session-ended-icon">⚡</div>
            <h2 className="session-ended-title">Sesja zakończona</h2>
            <p className="session-ended-reason">{mainMsg}</p>
            {hasDetails && (
              <div className="session-ended-error-box">
                <span className="session-ended-error-text">{details}</span>
                <button
                  className="session-ended-copy"
                  onClick={() => navigator.clipboard.writeText(copyText)}
                  title="Skopiuj błąd"
                >
                  📋 Kopiuj błąd
                </button>
              </div>
            )}
            <button className="session-ended-ok" onClick={() => setSessionEndedMsg(null)}>OK</button>
          </div>
        </div>
      )
    })()}

    {mode === 'radio' && pingMs !== null && (
      <div className={`ping-badge-inline ${isRadioVisualLoading ? 'ping-loading' : !isRadioPlaying ? 'ping-paused' : pingMs < 0 ? 'ping-off' : pingMs < 100 ? 'ping-good' : pingMs < 300 ? 'ping-ok' : 'ping-bad'}`}>
        <span className="ping-dot" />
        {isRadioVisualLoading ? (
          <span className="ping-dots"><span /><span /><span /></span>
        ) : !isRadioPlaying ? (
          <span className="ping-label">⏾ OFF</span>
        ) : (
          <span className="ping-label">{pingMs < 0 ? '×' : `${pingMs >= 1000 ? '999+' : pingMs}ms`}</span>
        )}
      </div>
    )}

    <MonopolyGame
      open={monopolyOpen}
      onClose={() => setMonopolyOpen(false)}
      sessionCode={sessionCode}
      myNickname={myNickname}
      isHost={isHost}
      initialPlayers={monopolyPlayers}
      gameDurationSeconds={monopolyDuration}
      nowPlayingName={mode === 'radio' ? currentStation?.name : currentTrack?.title}
      nowPlayingMode={mode}
    />

    <GameLobby
      open={gameLobbyOpen}
      onClose={() => setGameLobbyOpen(false)}
      sessionCode={sessionCode}
      myNickname={myNickname}
      isHost={isHost}
      gameState={gameState}
      onStartGame={(players, duration) => {
        setGameState('playing')
        setMonopolyPlayers(players)
        setMonopolyDuration(duration ?? 7200)
        setMonopolyOpen(true)
      }}
    />

    {showSizePanel && createPortal(
      <div className="size-panel">
        <div className="size-panel-title">Rozmiar okna</div>
        <div className="size-panel-list">
          {ZOOM_NAMES.map((name, i) => (
            <button
              key={i}
              className={`size-option${i === (pendingZoom ?? zoomIdx) ? ' selected' : ''}`}
              onClick={() => setPendingZoom(i === zoomIdx ? null : i)}
            >{name}{i === zoomIdx ? ' ✓' : ''}</button>
          ))}
        </div>
        {pendingZoom !== null && pendingZoom !== zoomIdx && (
          <button className="size-apply-btn" onClick={async () => {
            await window.playerBridge?.setZoom?.(pendingZoom)
            setShowSizePanel(false)
            setPendingZoom(null)
          }}>
            Zastosuj
          </button>
        )}
      </div>,
      document.body
    )}

    </>
  )
}

export default App
