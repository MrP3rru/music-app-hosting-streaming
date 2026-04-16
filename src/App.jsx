import { useEffect, useMemo, useRef, useState, startTransition, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactPlayer from 'react-player'
import HlsVideo from 'hls-video-element/react'
import AudioMotionAnalyzer from 'audiomotion-analyzer'
import ElectricBorder from './ElectricBorder'
import { useListenTogether } from './useListenTogether'
import { soundJoin, soundLeave, soundPermission, soundSessionEnd, soundSwitchRadio, soundSwitchPlayer, soundStartup, soundStop, soundCreateSession, soundChatMsg, setUiVolume } from './sounds'
import UpdateModal from './UpdateModal'
import VersionPopup from './VersionPopup'
import { ref, onValue, push, set, remove, onDisconnect, serverTimestamp } from 'firebase/database'
import { db } from './firebase'
import { GameLobby } from './GameLobby'
import { MonopolyGame } from './MonopolyGame'
import { LyricsOverlay } from './LyricsOverlay'
import DevDiagnosticsOverlay from './DevDiagnosticsOverlay'
import TvCastPanel from './TvCastPanel'
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

function sanitizeRuntimeUrl(url) {
  if (!url || typeof url !== 'string') return ''

  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'https://example.invalid/'
    const parsed = new URL(url, base)
    if (!/^https?:$/i.test(parsed.protocol)) return ''
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && parsed.protocol !== 'https:') {
      return ''
    }
    return parsed.toString()
  } catch {
    return ''
  }
}

// R─Öcznie zweryfikowane polskie stacje z dzia┼éaj─ůcymi streamami
function _pl(id, name, tags, bitrate, urls, favicon = '', homepage = '', votes = 5000) {
  const streamCandidates = urls.map(sanitizeRuntimeUrl).filter(Boolean)
  return {
    id: `curated-${id}`,
    name,
    countryCode: 'PL',
    country: 'Poland',
    codec: 'MP3',
    bitrate,
    tags,
    favicon: sanitizeRuntimeUrl(favicon),
    homepage: sanitizeRuntimeUrl(homepage),
    votes,
    lastSong: '',
    streamCandidates,
    url: streamCandidates[0] || '',
  }
}
const CURATED_PL_STATIONS = [
  // --- G┼é├│wne ---
  _pl('rmffm',     'RMF FM',                 'pop,hits,polskie',       128, ['https://rs9-krk2.rmfstream.pl/RMFFM48','https://rs6-krk2.rmfstream.pl/RMFFM48','http://188.165.12.72:8000/rmf_fm'], 'https://www.rmf.fm/favicon.ico', 'https://www.rmf.fm', 9999),
  _pl('radiozet',  'Radio ZET',              'pop,hits,polskie',       128, ['https://n-4-6.dcs.redcdn.pl/sc/o2/Eurozet/live/audio.livx','https://n-1-6.dcs.redcdn.pl/sc/o2/Eurozet/live/audio.livx','http://91.121.179.221:8050'], 'https://www.radiozet.pl/favicon.ico', 'https://www.radiozet.pl', 9998),
  _pl('trojka',    'Polskie Radio Tr├│jka',   'polskie,public,rock',    96,  ['https://mp3.polskieradio.pl:8904/','http://stream.polskieradio.pl/program3','https://stream3.polskieradio.pl:8954/'], 'https://www.polskieradio.pl/favicon.ico', 'https://trojka.polskieradio.pl', 9000),
  _pl('jedynka',   'Polskie Radio Jedynka',  'polskie,public,news',    96,  ['https://mp3.polskieradio.pl:8900/','http://stream.polskieradio.pl/program1','https://stream3.polskieradio.pl:8950/'], 'https://www.polskieradio.pl/favicon.ico', 'https://jedynka.polskieradio.pl', 8900),
  _pl('dwojka',    'Polskie Radio Dw├│jka',   'polskie,public,classical',96, ['https://mp3.polskieradio.pl:8902/','http://stream.polskieradio.pl/program2','https://stream3.polskieradio.pl:8952/'], 'https://www.polskieradio.pl/favicon.ico', 'https://dwojka.polskieradio.pl', 8800),
  _pl('czworka',   'Polskie Radio Czw├│rka',  'polskie,public,pop',     96,  ['https://mp3.polskieradio.pl:8906/','http://stream.polskieradio.pl/euro','https://stream3.polskieradio.pl:8956/'], 'https://www.polskieradio.pl/favicon.ico', 'https://czworka.polskieradio.pl', 8700),
  _pl('tokfm',     'TOK FM',                 'polskie,news,talk',      128, ['https://radiostream.pl/tuba10-1.mp3'], 'https://www.tokfm.pl/favicon.ico', 'https://www.tokfm.pl', 8500),
  _pl('antyradio', 'Antyradio',              'rock,polskie',           128, ['https://an03.cdn.eurozet.pl/ant-waw.mp3','https://an01.cdn.eurozet.pl/ant-waw.mp3'], 'https://www.antyradio.pl/favicon.ico', 'https://www.antyradio.pl', 8400),
  _pl('maryja',    'Radio Maryja',           'polskie,religious',       48, ['https://usa12.fastcast4u.com/proxy/isnesllc?mp=/1','https://radiomaryja.fastcast4u.com/proxy/radiomaryja'], 'https://www.radiomaryja.pl/favicon.ico', 'https://www.radiomaryja.pl', 8300),
  _pl('voxfm',     'VOX FM',                 'pop,polskie',            128, ['https://rs101-krk2.rmfstream.pl/VOXFM48','https://rs104-krk2.rmfstream.pl/VOXFM48'], '', 'https://www.voxfm.pl', 8200),
  // --- RMF podkana┼éy ---
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
  // --- ZET podkana┼éy ---
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
  _pl('zlotempl',       'Radio Z┼éote Przeboje',  'polskie,oldies',    128, ['http://poznan5-6.radio.pionier.net.pl:8000/tuba9-1.mp3'], '', '', 7000),
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
  _pl('radiokrakow',    'Radio Krak├│w',          'polskie,regional',   96, ['http://stream4.nadaje.com:9681/radiokrakow-s3'], '', 'https://www.radiokrakow.pl', 5000),
  _pl('radiolodz',      'Radio ┼ü├│d┼║',            'polskie,regional',   96, ['https://stream.radiolodz.toya.cloud/RadioLodz-1.mp3'], '', '', 4900),
  _pl('radiogdansk',    'Radio Gda┼äsk',          'polskie,regional',   96, ['http://stream.task.gda.pl:8443/rg1'], '', '', 4800),
  _pl('radiopoznan',    'Radio Pozna┼ä',          'polskie,regional',   96, ['http://stream4.nadaje.com:8579/poznan'], '', '', 4700),
  _pl('radiokampus',    'Radio Kampus',          'polskie,alternative',96, ['http://193.0.98.66:8002/'], '', '', 4600),
].filter((station) => station.streamCandidates.length > 0)
const failedImageUrls = new Set()
const MIX_PATTERN = /\b(mix|mixtape|megamix|nonstop|non[ -]stop)\b/i
const LIVE_PATTERN = /\b(live|concert|show)\b/i
const COMPILATION_PATTERN = /\b(playlist|compilation|full album|full mixtape|dj set|type beat|best of|greatest hits|sk┼éadanka|full ep|full lp|\d+\s*(songs?|tracks?|piosenek|hit├│w|utwor├│w))\b/i
const NON_MUSIC_PATTERN = /\b(gameplay|game|review|tutorial|how[ -]to|vlog|trailer|interview|podcast|episode|unboxing|reaction|challenge|prank|documentary|film|movie|gotowanie|przepis|recenzja|zgadnij|quiz|po bicie|rozpoznaj|test wiedzy|kt├│ry to|odgadnij|trivia|challenge|ranking top|top \d+|#\d)\b/i

const FILTER_TYPES = [
  { id: 'track', label: 'Utw├│r' },
  { id: 'mix', label: 'Mix / Mixtape' },
  { id: 'live', label: 'Live / Koncert' },
  { id: 'compilation', label: 'Sk┼éadanka' },
]

const FILTER_LANGUAGES = [
  { id: 'pl', label: '­čçÁ­čç▒ PL', query: 'polskie' },
  { id: 'en', label: '­čç║­čçŞ EN', query: 'english' },
  { id: 'es', label: '­čç¬­čçŞ ES', query: 'espa├▒ol' },
  { id: 'fr', label: '­čçź­čçĚ FR', query: 'fran├žais' },
  { id: 'de', label: '­čçę­čç¬ DE', query: 'deutsch' },
  { id: 'it', label: '­čç«­čç╣ IT', query: 'italiano' },
  { id: 'ru', label: '­čçĚ­čç║ RU', query: 'ĐÇĐâĐüĐüđ║đŞđ╣' },
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
  { id: 'classic', label: '2000ÔÇô2010' },
  { id: 'tens',    label: '2010ÔÇô2020' },
  { id: 'new',     label: 'Po 2020' },
]

const FILTER_DURATIONS = [
  { id: 'all',    label: 'Wszystkie' },
  { id: 'short',  label: 'Do 3 min',  max: 3 * 60 },
  { id: 'medium', label: '3ÔÇô6 min',   min: 3 * 60, max: 6 * 60 },
  { id: 'long',   label: '6ÔÇô12 min',  min: 6 * 60, max: 12 * 60 },
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
  // 'new' uses publishedAfter only ÔÇö no keywords needed

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

    // Heurystyka: je┼Ťli tryb tylko "utw├│r" i brak wyboru d┼éugo┼Ťci, odrzu─ç filmy >12min (prawdopodobne sk┼éadanki bez tagu)
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
    [station.urlResolved, station.url, station.url_resolved, station.url]
      .map(sanitizeRuntimeUrl)
      .filter(Boolean)
      .map((url) => ({ id: url, url })),
  ).map((entry) => entry.url)

  if (streamCandidates.length === 0) {
    return null
  }

  return {
    id: station.stationuuid,
    name: station.name,
    country: station.country || 'Online',
    countryCode: station.countrycode || '',
    votes: Number(station.votes || 0),
    codec: station.codec,
    bitrate: station.bitrate,
    tags: station.tags,
    homepage: sanitizeRuntimeUrl(station.homepage),
    url: streamCandidates[0],
    streamCandidates,
    favicon: sanitizeRuntimeUrl(station.favicon),
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

const countryRegionNames = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['pl', 'en'], { type: 'region' })
  : null

function formatCountryCodeLabel(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return code
  try {
    const regionName = countryRegionNames?.of(code)
    if (!regionName || regionName.toUpperCase() === code) return code
    return `${code} (${regionName})`
  } catch {
    return code
  }
}

function formatCountryOptionLabel(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return code
  return `${countryFlagEmoji(code)} ${formatCountryCodeLabel(code)}`
}

function getCountryFlagImageUrl(countryCode) {
  const code = String(countryCode || '').trim().toLowerCase()
  if (!/^[a-z]{2}$/.test(code)) return ''
  return `https://flagcdn.com/24x18/${code}.png`
}

function getTvChannelCountryCodes(channel) {
  const fromArray = Array.isArray(channel?.countryCodes) ? channel.countryCodes : []
  const fromSingle = String(channel?.country || '')
    .toUpperCase()
    .split(/[\s,;|/]+/)
    .map((token) => token.trim())
    .filter(Boolean)

  return [...new Set([...fromArray, ...fromSingle])].filter((code) => /^[A-Z]{2}$/.test(code))
}

function weatherIcon(code) {
  if (code === 0) return 'ÔśÇ´ŞĆ'
  if (code <= 2) return '­čîĄ´ŞĆ'
  if (code === 3) return 'Ôśü´ŞĆ'
  if (code <= 48) return '­čîź´ŞĆ'
  if (code <= 55) return '­čîŽ´ŞĆ'
  if (code <= 65) return '­čîž´ŞĆ'
  if (code <= 77) return 'ÔŁä´ŞĆ'
  if (code <= 82) return '­čîŽ´ŞĆ'
  if (code <= 86) return 'ÔŁä´ŞĆ'
  return 'ÔŤł´ŞĆ'
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
 * @param {number} percent - G┼éo┼Ťno┼Ť─ç w procentach (0-100)
 * @param {'linear'|'sqrt'|'square'} [curve='linear'] - Typ krzywej regulacji
 * @returns {number} - Warto┼Ť─ç g┼éo┼Ťno┼Ťci (0-1)
 */
function toEffectiveVolume(percent, curve = 'linear') {
  const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  if (safePercent === 0) return 0;
  const normalized = safePercent / 100;
  switch (curve) {
    case 'square': return normalized * normalized;
    case 'sqrt':   return Math.sqrt(normalized);
    // Logarytmiczna krzywa audio: 0%Ôćĺ0, 1%Ôëł-40dB, 50%Ôëł-20dB, 75%Ôëł-10dB, 100%Ôćĺ0dB
    // Naturalna dla ucha ÔÇö pokrywa pe┼éen zakres dynamiki bez "g┼éo┼Ťnego" minimum
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
            <span className="chat-preview-label">ÔľÂ YouTube</span>
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

function getStationGradientArt(name) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  const light = `hsl(${hue},55%,58%)`
  const dark  = `hsl(${hue},65%,20%)`

  // Split name into max 2 lines of ~12 chars each
  const label = (name || 'Radio').trim()
  const words = label.split(/\s+/)
  const lines = []
  let cur = ''
  for (const word of words) {
    const chunk = word.slice(0, 13)
    if (!cur) { cur = chunk }
    else if ((cur + ' ' + chunk).length <= 13) { cur += ' ' + chunk }
    else { lines.push(cur); if (lines.length >= 2) break; cur = chunk }
  }
  if (cur && lines.length < 2) lines.push(cur)

  const baseY = lines.length === 1 ? 44 : 37
  const textEls = lines.map((line, i) =>
    `<text x="40" y="${baseY + i * 15}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="10.5" font-weight="700" fill="rgba(255,255,255,0.82)" letter-spacing="0.3">${line}</text>`
  ).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${light}"/><stop offset="100%" stop-color="${dark}"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/>${textEls}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function getPlaceholderArt(label, type) {
  if (type === 'radio') return getStationGradientArt(label)
  const safeLabel = encodeURIComponent((label || 'Track').slice(0, 18))
  return `https://placehold.co/320x320/1c1d3c/ffd36e?text=${safeLabel}`
}

function sanitizeImageUrl(url) {
  const safeUrl = sanitizeRuntimeUrl(url)
  if (!safeUrl) return ''
  try {
    const u = new URL(safeUrl)
    const host = u.hostname.toLowerCase()
    const path = u.pathname.toLowerCase()
    // Znane ┼║r├│d┼éa generuj─ůce du┼╝y szum 404/403/412/429.
    if (host.includes('upload.wikimedia.org')) return ''
    if (host.includes('24dubstep.pl')) return ''
    if (host.includes('firebasestorage.googleapis.com')) return ''
    if (host.includes('super-radio-mobile.devhub.top')) return ''
    if (host.includes('superradio.cc')) return ''
    if (host.includes('radiofrance.fr') && path.includes('favicon')) return ''
    if (host.includes('lesonunique.com') && path.includes('/images_flux/logos/')) return ''
    if (path.endsWith('/apple-touch-icon.png')) return ''
    return safeUrl
  } catch {
    return ''
  }
}

function withFallbackArt(event, label, type) {
  const target = event.currentTarget
  const failed = target.src
  if (failed && !failed.startsWith('https://placehold.co') && !failed.startsWith('data:')) {
    failedImageUrls.add(failed)
  }
  target.onerror = null
  target.src = getPlaceholderArt(label, type)
}

function safeArt(url, label, type) {
  const clean = sanitizeImageUrl(url)
  if (!clean || failedImageUrls.has(clean)) return getPlaceholderArt(label, type)
  return clean
}

function getDiscordTrackArt(track) {
  const primary = sanitizeImageUrl(track?.thumbnail)
  if (primary) return primary
  const ytId = String(track?.id || '').trim() || extractYoutubeId(String(track?.url || '').trim())
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
  return ''
}

function shuffleArray(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Statyczne dane dla idle wave ÔÇö kszta┼ét ┼éuku sinusoidalnego
const IDLE_BARS = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47
  return Math.round(12 + Math.sin(t * Math.PI) * 58 + Math.sin(t * Math.PI * 3) * 10)
})

const CHAT_COMMANDS = [
  { cmd: '/next',   desc: 'Nast─Öpny utw├│r/stacja',          argHint: '',                role: 'mod' },
  { cmd: '/stop',   desc: 'Zatrzymaj odtwarzanie',          argHint: '',                role: 'mod' },
  { cmd: '/pause',  desc: 'Pauza',                          argHint: '',                role: 'mod' },
  { cmd: '/play',   desc: 'Wzn├│w odtwarzanie',              argHint: '',                role: 'mod' },
  { cmd: '/mute',   desc: 'Wycisz u┼╝ytkownika',             argHint: '[nick] [sek=30]', role: 'host' },
  { cmd: '/unmute', desc: 'Odcisz u┼╝ytkownika',             argHint: '[nick]',          role: 'host' },
  { cmd: '/clear',  desc: 'Wyczy┼Ť─ç czat',                   argHint: '',                role: 'host' },
  { cmd: '/me',     desc: 'Akcja/emote',                    argHint: '[tekst]',         role: 'mod' },
  { cmd: '/msg',    desc: 'Prywatna wiadomo┼Ť─ç',             argHint: '[nick] [tekst]',  role: 'all' },
  { cmd: '/r',      desc: 'Odpowiedz na ostatni PM',        argHint: '[tekst]',         role: 'all' },
  { cmd: '/vol',    desc: 'Ustaw g┼éo┼Ťno┼Ť─ç',                 argHint: '[0-100]',         role: 'all' },
  { cmd: '/queue',  desc: 'Poka┼╝ kolejk─Ö',                  argHint: '',                role: 'all' },
  { cmd: '/sys',    desc: 'W┼é/Wy┼é wiadomo┼Ťci systemowe',   argHint: '',                role: 'all' },
  { cmd: '/help',   desc: 'Lista komend',                   argHint: '',                role: 'all' },
]

const LibraryItem = memo(function LibraryItem({ item, selected, mode, activeTrackRef, onSelect, onSuggest, isSuggested, canSuggest, art, flag }) {
  return (
    <div
      ref={selected ? activeTrackRef : null}
      className={`library-item${selected ? ' active' : ''}${canSuggest ? ' with-suggest' : ''}`}
      onClick={() => onSelect(item)}
      style={{ cursor: 'pointer' }}
    >
      <div className="item-art with-badge">
        <img
          src={art}
          alt=""
          loading="lazy"
          onError={(e) => withFallbackArt(e, mode === 'radio' ? item.name : item.title, mode === 'radio' ? 'radio' : 'track')}
        />
        <span className="flag-badge small">{flag}</span>
      </div>
      <div className="item-copy">
        <strong>{mode === 'radio' ? item.name : item.title}</strong>
        <span>
          {mode === 'radio'
            ? [item.country, item.codec, item.votes ? `${item.votes} g┼éos├│w` : ''].filter(Boolean).join(' ÔÇó ')
            : [item.author, item.duration].filter(Boolean).join(' ÔÇó ')}
        </span>
      </div>
      {canSuggest && (
        <button
          className={`suggest-btn${isSuggested ? ' done' : ''}`}
          title={isSuggested ? 'Ju┼╝ zasugerowa┼ée┼Ť' : 'Zasugeruj hostowi'}
          onClick={(e) => onSuggest(e, item)}
        >{isSuggested ? 'Ôťô' : '+'}</button>
      )}
    </div>
  )
})

// ÔöÇÔöÇÔöÇ TV ÔÇö HLS player wrapper ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
function TvChannelPlayer({ channel, videoRef, onError, onPlaying, onPause, onStall, volume, expanded = false }) {
  const innerRef = useRef(null)
  const resolvedRef = videoRef || innerRef
  useEffect(() => {
    // Wymu┼Ť clip-path na wewn─Ötrznym <video> w Shadow DOM hls-video-element.
    const el = resolvedRef.current
    if (!el) return
    const apply = () => {
      const vid = el.nativeEl
      if (vid) vid.style.clipPath = 'inset(0)'
    }
    apply()
    const t = setTimeout(apply, 150)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = resolvedRef.current
    if (!el) return
    // Ustaw g┼éo┼Ťno┼Ť─ç natychmiast ÔÇö zanim autoPlay wyda d┼║wi─Ök
    if (volume !== undefined) el.volume = volume
    const onErr  = () => onError?.()
    const onPlay = () => onPlaying?.()
    const onPaus = () => onPause?.()
    const onWait = () => onStall?.()
    el.addEventListener('error',   onErr)
    el.addEventListener('playing', onPlay)
    el.addEventListener('pause',   onPaus)
    el.addEventListener('stalled', onWait)
    el.addEventListener('waiting', onWait)
    return () => {
      el.removeEventListener('error',   onErr)
      el.removeEventListener('playing', onPlay)
      el.removeEventListener('pause',   onPaus)
      el.removeEventListener('stalled', onWait)
      el.removeEventListener('waiting', onWait)
    }
  }, [onError, onPlaying, onPause, onStall, volume])

  return (
    <HlsVideo
      ref={resolvedRef}
      src={channel.url}
      autoPlay={false}
      style={{ width: '100%', height: '100%', display: 'block', background: '#000', borderRadius: expanded ? 0 : 14 }}
    />
  )
}

// ÔöÇÔöÇÔöÇ TV ÔÇö kategorie i parser M3U ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Kurowane polskie kana┼éy TVP ÔÇö statyczne HLS (tvpstream API jest nieaktywne)
const CURATED_TV_PL = [
  { id: 'tvp1',       name: 'TVP 1',       logo: '', country: 'PL', url: 'https://ec06-krk3.cache.orange.pl/dai4/org1/vb/104/tvp1hd/index.m3u8' },
  { id: 'tvpinfo',    name: 'TVP Info',    logo: '', country: 'PL', url: 'http://78.130.250.2:8023/play/a03b/index.m3u8' },
  { id: 'tvppolonia', name: 'TVP Polonia', logo: '', country: 'PL', url: 'https://dash2.antik.sk/live/test_tvp_polonia/playlist.m3u8' },
  { id: 'tvpworld',   name: 'TVP World',   logo: '', country: 'PL', url: 'https://dash2.antik.sk/live/test_tvp_world/playlist.m3u8' },
]

const TV_POLAND_TRUSTED_EXTRA_URLS = [
  'https://iptv-org.github.io/iptv/languages/pol.m3u',
  'https://iptv-org.github.io/iptv/regions/europe.m3u',
  'https://iptv-org.github.io/iptv/categories/news.m3u',
  'https://iptv-org.github.io/iptv/categories/music.m3u'
]

const TV_RETRO_LOCAL_PATTERN = /\b(retro|classic|vintage|oldies|local|regional|community|city|travel|weather|shop|music|party|dance|fun|comedy)\b/i

const TV_CATEGORIES = [
  {
    id: 'all',
    label: '­čîÉ Wszystkie',
    url: 'https://iptv-org.github.io/iptv/index.m3u',
    extraUrls: ['https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8']
  },
  {
    id: 'pl',
    label: '­čçÁ­čç▒ Polskie',
    url: 'https://iptv-org.github.io/iptv/countries/pl.m3u',
    extraUrls: TV_POLAND_TRUSTED_EXTRA_URLS,
    countryHints: ['PL'],
    curated: CURATED_TV_PL
  },
  { id: 'news',          label: '­čô░ Wiadomo┼Ťci',    url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
  { id: 'music',         label: '­čÄÁ Muzyczne',      url: 'https://iptv-org.github.io/iptv/categories/music.m3u' },
  {
    id: 'retro-local',
    label: '­č¬ę Dziwne / Retro / Local',
    url: 'https://iptv-org.github.io/iptv/categories/classic.m3u',
    extraUrls: [
      'https://iptv-org.github.io/iptv/categories/public.m3u',
      'https://iptv-org.github.io/iptv/categories/travel.m3u',
      'https://iptv-org.github.io/iptv/categories/weather.m3u',
      'https://iptv-org.github.io/iptv/categories/shop.m3u',
      'https://iptv-org.github.io/iptv/categories/relax.m3u'
    ],
    keywordFilter: TV_RETRO_LOCAL_PATTERN
  },
  { id: 'sports',        label: 'ÔÜŻ Sport',          url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { id: 'entertainment', label: '­čÄČ Rozrywka',      url: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u' },
  { id: 'kids',          label: '­čĹÂ Dla dzieci',    url: 'https://iptv-org.github.io/iptv/categories/kids.m3u' },
  { id: 'science',       label: '­čöş Nauka',         url: 'https://iptv-org.github.io/iptv/categories/science.m3u' },
  { id: 'documentary',   label: '­čÄą Dokumentalne',  url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u' },
]

const TV_COMMON_COUNTRY_CODES = [
  'PL', 'US', 'GB', 'DE', 'FR', 'IT', 'ES', 'PT', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'IE',
  'CZ', 'SK', 'HU', 'RO', 'BG', 'HR', 'SI', 'RS', 'BA', 'ME', 'MK', 'AL', 'GR', 'TR', 'UA', 'LT', 'LV',
  'EE', 'IS', 'LU', 'MD', 'GE', 'AM', 'AZ', 'IL', 'AE', 'SA', 'QA', 'KW', 'EG', 'MA', 'TN', 'DZ', 'ZA',
  'KE', 'NG', 'GH', 'IN', 'PK', 'BD', 'LK', 'NP', 'TH', 'VN', 'MY', 'SG', 'ID', 'PH', 'JP', 'KR', 'TW',
  'HK', 'CN', 'AU', 'NZ', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'UY', 'PY', 'BO', 'EC', 'CR',
  'PA', 'DO', 'CU', 'JM', 'TT', 'PR', 'AW', 'CW'
]

function normalizeCountryToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TV_COUNTRY_NAME_ALIASES = new Map([
  ['poland', 'PL'],
  ['polska', 'PL'],
  ['pol', 'PL'],
  ['polish', 'PL'],
  ['jezyk polski', 'PL'],
  ['united states', 'US'],
  ['usa', 'US'],
  ['u s a', 'US'],
  ['united kingdom', 'GB'],
  ['great britain', 'GB'],
  ['uk', 'GB'],
  ['england', 'GB'],
  ['germany', 'DE'],
  ['deutschland', 'DE'],
  ['france', 'FR'],
  ['italy', 'IT'],
  ['spain', 'ES'],
  ['portugal', 'PT'],
  ['netherlands', 'NL'],
  ['holland', 'NL'],
  ['czech republic', 'CZ'],
  ['czechia', 'CZ'],
  ['slovakia', 'SK'],
  ['ukraine', 'UA'],
  ['turkey', 'TR'],
  ['turkiye', 'TR'],
  ['south korea', 'KR'],
  ['north korea', 'KP'],
  ['united arab emirates', 'AE'],
  ['uae', 'AE']
])

const TV_REGION_NAME_TO_CODE = (() => {
  const map = new Map(TV_COUNTRY_NAME_ALIASES)
  if (!countryRegionNames) return map
  for (const code of TV_COMMON_COUNTRY_CODES) {
    try {
      const name = countryRegionNames.of(code)
      const normalized = normalizeCountryToken(name)
      if (normalized) map.set(normalized, code)
    } catch {}
  }
  return map
})()

const TV_POLISH_HINT_PATTERN = /\b(polska|poland|polski|polskie|tvp|polsat|tvn|eska|polo\s*tv|republika|trwam|wpolsce24|w\s*polsce\s*24)\b/i

function isLikelyPolishFeed(url) {
  const value = String(url || '').toLowerCase()
  return value.includes('/countries/pl.m3u') || value.includes('/languages/pol.m3u')
}

function isLikelyPolishTvChannel(channel) {
  if (!channel) return false
  const countries = getTvChannelCountryCodes(channel)
  if (countries.includes('PL')) return true

  const lang = normalizeCountryToken(channel.languageRaw || '')
  if (lang.includes('pol') || lang.includes('polish') || lang.includes('polski')) return true

  const text = `${channel.name || ''} ${channel.id || ''}`
  if (TV_POLISH_HINT_PATTERN.test(text)) return true

  try {
    const host = new URL(channel.url).hostname.toLowerCase()
    if (host.endsWith('.pl')) return true
  } catch {}

  if (channel.feedHintCountry === 'PL') return true
  return false
}

function resolveCountryTokenToCode(token) {
  const upper = String(token || '').trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(upper)) return upper
  const normalized = normalizeCountryToken(token)
  if (!normalized) return ''
  return TV_REGION_NAME_TO_CODE.get(normalized) || ''
}

function sanitizeTvLogoUrl(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (host.includes('upload.wikimedia.org')) return ''
    if (host.includes('24dubstep.pl')) return ''
    return url
  } catch {
    return ''
  }
}

function normalizeTvCountryCodes(countryRaw, channelId = '', streamUrl = '') {
  const codes = new Set()
  const rawTokens = String(countryRaw || '')
    .split(/[\s,;|/]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  for (const token of rawTokens) {
    const code = resolveCountryTokenToCode(token)
    if (code) codes.add(code)
  }

  const idMatch = String(channelId || '').toUpperCase().match(/(?:^|[._-])([A-Z]{2})(?:$|[._-])/)
  if (idMatch?.[1]) codes.add(idMatch[1])

  return [...codes]
}

function parseM3U(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const channels = []
  const MAX_CHANNELS = 12000
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF')) continue
    const info = lines[i]
    let j = i + 1
    while (j < lines.length && lines[j].startsWith('#')) j += 1
    const url = lines[j]
    if (!url || url.startsWith('#')) continue
    if (!/^https?:\/\//i.test(url)) continue          // bezpiecze┼ästwo ÔÇö tylko http/https
    if (/liveovh\d+\.cda\.pl/.test(url)) continue     // CDA CDN wymaga token├│w auth
    const name    = (info.match(/,(.+)$/)         || [])[1]?.trim() || 'Kana┼é'
    const logoRaw = (info.match(/tvg-logo="([^"]*)"/) || [])[1] || ''
    const logo    = sanitizeTvLogoUrl(logoRaw)
    const id      = (info.match(/tvg-id="([^"]*)"/)     || [])[1] || url
    const countryRaw = (info.match(/tvg-country="([^"]*)"/) || [])[1] || ''
    const groupTitleRaw = (info.match(/group-title="([^"]*)"/) || [])[1] || ''
    const languageRaw = (info.match(/tvg-language="([^"]*)"/) || [])[1] || ''
    const countryCodes = normalizeTvCountryCodes(
      `${countryRaw} ${groupTitleRaw} ${languageRaw}`,
      id,
      url
    )
    const country = countryCodes[0] || ''
    channels.push({ id, name, logo, country, countryCodes, languageRaw, groupTitleRaw, url })
    if (channels.length >= MAX_CHANNELS) break
    i = j
  }
  return channels
}

function dedupeTvChannels(channels) {
  const seen = new Set()
  const result = []
  for (const ch of channels) {
    const urlKey = String(ch?.url || '').trim().toLowerCase()
    const nameKey = String(ch?.name || '').trim().toLowerCase()
    const key = urlKey || `${nameKey}::${String(ch?.id || '')}`
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(ch)
  }
  return result
}

function isValidYoutubeUrl(url) {
  try {
    const u = new URL(url)
    return ['youtube.com','www.youtube.com','youtu.be','m.youtube.com'].includes(u.hostname)
  } catch { return false }
}

function getYoutubeVideoId(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split(/[?#]/)[0]
    let id = u.searchParams.get('v')
    if (!id) { const m = u.pathname.match(/\/(?:embed|v|shorts|live)\/([\w-]{11})/); if (m) id = m[1] }
    return id || null
  } catch { return null }
}

function getYoutubeEmbedUrl(url) {
  const id = getYoutubeVideoId(url)
  if (!id) return null
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&controls=0`
}

function App() {
  const TV_DVR_LIVE_BUFFER = 12
  const TV_DVR_MAX_WINDOW_SECONDS = 180
  const ZOOM_LEVELS = Array.from({ length: 31 }, (_, i) => Math.round((0.70 + i * 0.02) * 100) / 100)
  const ZOOM_LABELS = ZOOM_LEVELS.map(f => `${Math.round(f * 100)}%`)
  const ZOOM_NAMES  = ZOOM_LEVELS.map((f, i) => {
    const pct = Math.round(f * 100)
    const w   = Math.round(1460 * f)
    const h   = Math.round(940  * f)
    return i === 16 ? `102% ÔÇö Normalne (${w} ├Ś ${h})` : `${pct}% ÔÇö ${w} ├Ś ${h}`
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
    // D┼║wi─Ök startowy po chwili (┼╝eby AudioContext m├│g┼é si─Ö zainicjowa─ç)
    const startSound = setTimeout(() => soundStartup(), 800)
    // Sprawd┼║ aktualizacje 3s po starcie (nie blokuj ┼éadowania UI)
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
  const [ytLoggedIn, setYtLoggedIn] = useState(false)
  const [myPlaylists, setMyPlaylists] = useState([])
  const [myPlaylistsLoading, setMyPlaylistsLoading] = useState(false)
  const [loadingPlaylistId, setLoadingPlaylistId] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const [chatUnread, setChatUnread] = useState(0)
  const chatEndRef = useRef(null)
  const [cmdSuggestions, setCmdSuggestions] = useState([])
  const [cmdSuggestIdx, setCmdSuggestIdx] = useState(0)
  const cmdListRef = useRef(null)
  const lastPmSenderRef = useRef(null)
    // Zapisuj wybrany gatunek do localStorage przy ka┼╝dej zmianie
    useEffect(() => {
      localStorage.setItem('hiphop-player-genre', genreId)
    }, [genreId])

    // Zapisuj widok biblioteki do localStorage przy ka┼╝dej zmianie
    useEffect(() => {
      localStorage.setItem('hiphop-player-libraryview', libraryView)
    }, [libraryView])

  // Przywracanie filtra kraju i frazy wyszukiwania stacji z localStorage
  const [countryFilter, setCountryFilter] = useState('PL')
  const [radioTagFilter, setRadioTagFilter] = useState('hiphop')
  const [stationSearchTerm, setStationSearchTerm] = useState(() => localStorage.getItem('hiphop-player-stationsearch') || '')
  const [visibleStationCount, setVisibleStationCount] = useState(40)
  const stationListSentinelRef = useRef(null)
  const libraryListRef = useRef(null)
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
  const [trackPage, setTrackPage] = useState(0)
  const PAGE_SIZE = 50
  const [trackError, setTrackError] = useState('')
  const [currentTrack, setCurrentTrack] = useState(null)
  const [isRadioPlaying, setIsRadioPlaying] = useState(false)
  const [isRadioBuffering, setIsRadioBuffering] = useState(false)
  const [isTrackPlaying, setIsTrackPlaying] = useState(false)
  const [isTrackReady, setIsTrackReady] = useState(false)
  const [devPanelOpen, setDevPanelOpen] = useState(false)

  const [sessionEndedMsg, setSessionEndedMsg] = useState(null)
  const [radioNowPlaying, setRadioNowPlaying] = useState('')
  const [radioNowPlayingAt, setRadioNowPlayingAt] = useState(null)
  const [radioPlayHistory, setRadioPlayHistory] = useState([])
  const prevRadioNowPlayingRef = useRef('')
  const radioNowPlayingRef     = useRef('')
  const [trackDuration, setTrackDuration] = useState(0)
  const [trackTime, setTrackTime] = useState(0)
  const [discordTrackSyncNonce, setDiscordTrackSyncNonce] = useState(0)
  const [trackStreamUrl, setTrackStreamUrl] = useState('')
  const trackTimeRef = useRef(0)
  const pendingRemoteSeekRef = useRef(null)
  const [isSeeking, setIsSeeking] = useState(false)
  const isSeekingRef = useRef(false)
  const [sessionModalOpen, setSessionModalOpen] = useState(false)
  const [tvCastOpen, setTvCastOpen] = useState(false)
  const [tvActiveDevice, setTvActiveDevice] = useState(null)
  const tvActiveDeviceRef = useRef(null)
  const tvLastCastKeyRef  = useRef('')
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

  // Refs do bezpo┼Ťrednich aktualizacji DOM podczas przeci─ůgania (bez re-renderu)
  const volumeFillRef = useRef(null)
  const volumeThumbRef = useRef(null)
  const volumeLabelRef = useRef(null)
  const pendingVolumeRef = useRef(null)
  const lastVolumeBeforeMuteRef = useRef(35)
  const seekFillRef = useRef(null)
  const seekThumbRef = useRef(null)
  const seekTimeDisplayRef = useRef(null)
  const seekBufferRef = useRef(null)
  const seekValueRef = useRef(null)
  const playerRef = useRef(null)

  const [loadingMoreTracks, setLoadingMoreTracks] = useState(false)
  const [previousTracks, setPreviousTracks] = useState([])
  const [trackHistory, setTrackHistory] = useState(loadHistory)
  const [historyExpanded, setHistoryExpanded] = useState(false)

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'F9') return
      e.preventDefault()
      setDevPanelOpen((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ÔöÇÔöÇÔöÇ TV ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  const [tvSubMode, setTvSubMode]         = useState('channels') // 'channels' | 'youtube'
  const [tvCategoryId, setTvCategoryId]   = useState('pl')
  const [tvChannels, setTvChannels]       = useState([])
  const [tvLoading, setTvLoading]         = useState(false)
  const [currentTvChannel, setCurrentTvChannel] = useState(null)
  const [tvPlayerError, setTvPlayerError] = useState(false)
  const [tvYoutubeInput, setTvYoutubeInput] = useState('')
  const [tvYoutubeUrl, setTvYoutubeUrl]   = useState('')
  const [tvChannelSearch, setTvChannelSearch] = useState('')
  const [tvChannelPage, setTvChannelPage]     = useState(0)
  const [tvCountryFilter, setTvCountryFilter] = useState('')
  const [tvCountryPickerOpen, setTvCountryPickerOpen] = useState(false)
  const [tvCountrySearch, setTvCountrySearch] = useState('')
  const [tvExpandMode, setTvExpandMode] = useState('normal') // 'normal' | 'app' | 'monitor'
  const [tvStreamNonce, setTvStreamNonce] = useState(0)
  const TV_PAGE_SIZE = 40
  const tvPlayerRef    = useRef(null)
  const tvVideoRef     = useRef(null)
  const tvPlayerWrapRef = useRef(null)
  const tvCountryPickerRef = useRef(null)
  const [tvIsPlaying, setTvIsPlaying] = useState(false)
  const [tvCurrentTime, setTvCurrentTime]       = useState(0)
  const [tvSeekableStart, setTvSeekableStart]   = useState(0)
  const [tvSeekableEnd, setTvSeekableEnd]       = useState(0)
  const [tvHasDvr, setTvHasDvr]               = useState(false)
  const tvLastProgressRef = useRef({ time: 0, at: 0 })
  const tvRecoverTimerRef = useRef(null)
  const tvM3uAbortRef = useRef(null)
  const tvAutoRetryRef = useRef(0)
  const onTvError   = useCallback(() => setTvPlayerError(true),  [])
  const onTvPlaying = useCallback(() => { setTvPlayerError(false); setTvIsPlaying(true) }, [])
  const onTvPause   = useCallback(() => setTvIsPlaying(false), [])

  useEffect(() => {
    if (!tvCountryPickerOpen) return
    const onDocClick = (event) => {
      if (!tvCountryPickerRef.current?.contains(event.target)) {
        setTvCountryPickerOpen(false)
        setTvCountrySearch('')
      }
    }
    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setTvCountryPickerOpen(false)
        setTvCountrySearch('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onEsc)
    }
  }, [tvCountryPickerOpen])

  const recoverTvStream = useCallback(() => {
    if (mode !== 'tv' || !currentTvChannel || tvSubMode !== 'channels') return
    // Kr├│tki debounce, ┼╝eby nie robi─ç wielu restart├│w naraz.
    if (tvRecoverTimerRef.current) return
    tvRecoverTimerRef.current = setTimeout(() => {
      tvRecoverTimerRef.current = null
      const el = tvVideoRef.current
      try {
        if (el) {
          const base = Number.isFinite(el.seekable?.length) && el.seekable.length > 0 ? el.seekable.end(0) : null
          el.load?.()
          el.play?.().catch(() => {})
          if (base !== null) el.currentTime = Math.max(el.seekable.start(0), base - 10)
        } else {
          setTvStreamNonce(n => n + 1)
        }
      } catch {
        setTvStreamNonce(n => n + 1)
      }
      tvAutoRetryRef.current += 1
      if (tvAutoRetryRef.current > 3) {
        setTvPlayerError(true)
      }
    }, 900)
  }, [mode, currentTvChannel, tvSubMode])

  const onTvStall = useCallback(() => {
    if (!tvIsPlaying || !currentTvChannel) return
    recoverTvStream()
  }, [tvIsPlaying, currentTvChannel, recoverTvStream])

  useEffect(() => {
    if (!tvPlayerError || tvSubMode !== 'channels' || !currentTvChannel) return
    recoverTvStream()
  }, [tvPlayerError, tvSubMode, currentTvChannel, recoverTvStream])

  // ÔöÇÔöÇÔöÇ TV YouTube IFrame API ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  const tvYtIframeRef    = useRef(null)
  const tvYtVolRef       = useRef(35)
  const [tvYtPlaying, setTvYtPlaying]         = useState(false)
  const [tvYtCurrentTime, setTvYtCurrentTime] = useState(0)
  const [tvYtDuration, setTvYtDuration]       = useState(0)
  const [tvYtTitle, setTvYtTitle]             = useState('')
  const [tvYtThumbnail, setTvYtThumbnail]     = useState('')
  const [tvYtCc, setTvYtCc]                  = useState(false)

  // Wyj┼Ťcie z trybu rozszerzonego ÔÇö Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        window.playerBridge?.setWindowFullscreen?.(false)
        setTvExpandMode('normal')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [localQueue, setLocalQueue] = useState([])
  const localQueueRef = useRef([])
  const activeTrackRef = useRef(null)
  const preloadedForRef = useRef(null)
  const [activeTrackQuery, setActiveTrackQuery] = useState('')
  // Inicjalizacja volumePercent z localStorage lub domy┼Ťlnie 35
  const [volumePercent, setVolumePercent] = useState(() => {
    const stored = localStorage.getItem('hiphop-player-volume')
    const parsed = Number(stored)
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 35
  })
  // Inicjalizacja currentStation z localStorage je┼Ťli istnieje
  const [favorites, setFavorites] = useState(loadStoredFavorites)
  // ÔöÇÔöÇÔöÇ Adaptacyjne FPS: 45 aktywna, 24 nieaktywna, 6 ukryta ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  const fpsRef = useRef(45)
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'hidden') {
        fpsRef.current = 6
        document.documentElement.classList.add('page-hidden')
      } else {
        fpsRef.current = document.hasFocus() ? 45 : 24
        document.documentElement.classList.remove('page-hidden')
      }
    }
    const onFocus = () => { if (document.visibilityState !== 'hidden') { fpsRef.current = 45; document.documentElement.classList.remove('page-hidden') } }
    const onBlur  = () => { if (document.visibilityState !== 'hidden') fpsRef.current = 24 }
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur',  onBlur)
    update()
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur',  onBlur)
    }
  }, [])

  // ÔöÇÔöÇÔöÇ Zegar ÔÇö bezpo┼Ťrednia aktualizacja DOM (bez re-renderu ca┼éej apki) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  const clockHmRef   = useRef(null)
  const clockSRef    = useRef(null)
  const clockDateRef = useRef(null)
  useEffect(() => {
    const update = () => {
      const now = new Date()
      if (clockHmRef.current)   clockHmRef.current.textContent   = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
      if (clockSRef.current)    clockSRef.current.textContent    = ':' + now.getSeconds().toString().padStart(2, '0')
      if (clockDateRef.current) clockDateRef.current.textContent = now.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])

  const [weather, setWeather] = useState(null)
  useEffect(() => {
    const LAT = 52.2297, LON = 21.0122 // Warszawa
    async function fetchWeather() {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
          `&current=temperature_2m,weather_code` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
          `&timezone=Europe%2FWarsaw&forecast_days=5`
        )
        const data = await res.json()
        setWeather({
          temp: Math.round(data.current.temperature_2m),
          code: data.current.weather_code,
          forecast: data.daily.time.slice(1, 5).map((date, i) => ({
            date,
            code: data.daily.weather_code[i + 1],
            max: Math.round(data.daily.temperature_2m_max[i + 1]),
            min: Math.round(data.daily.temperature_2m_min[i + 1]),
          })),
        })
      } catch {}
    }
    fetchWeather()
    const t = setInterval(fetchWeather, 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const [onlineCount, setOnlineCount] = useState(0)
  useEffect(() => {
    const connectedRef = ref(db, '.info/connected')
    let myPresenceRef = null
    const unsubConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        myPresenceRef = push(ref(db, 'presence'))
        onDisconnect(myPresenceRef).remove()
        set(myPresenceRef, { ts: serverTimestamp() })
      }
    })
    const unsubCount = onValue(ref(db, 'presence'), (snap) => {
      const val = snap.val()
      setOnlineCount(val ? Object.keys(val).length : 0)
    })
    return () => {
      unsubConnected()
      unsubCount()
      if (myPresenceRef) remove(myPresenceRef)
    }
  }, [])

  // Przywracanie ostatniej stacji po starcie aplikacji

  useEffect(() => {
    const storedStation = localStorage.getItem('hiphop-player-last-station')
    if (storedStation) {
      try {
        const parsed = JSON.parse(storedStation)
        if (parsed && parsed.id) {
          setCurrentStation(parsed)
          // Ustaw od razu streamy i indeks, je┼Ťli stacje s─ů ju┼╝ za┼éadowane
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
  const bgCanvasRef = useRef(null)

  // Inicjalizacja AudioMotionAnalyzer ÔÇö jeden raz przy mount
  useEffect(() => {
    if (!audioMotionContainerRef.current) return

    const audioMotion = new AudioMotionAnalyzer(audioMotionContainerRef.current, {
      mode: 1,                // oddzielne s┼éupki
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
      // Bass daje kopni─Öcia (kick, sub) ÔÇö wa┼╝niejszy dla chaosu i dynamiki
      electricEnergyRef.current = Math.min(1, bass * 0.6 + overall * 0.4)
    }

    audioMotionRef.current = audioMotion

    return () => {
      audioMotion.destroy()
      audioMotionRef.current = null
    }
  }, [])

  // ÔöÇÔöÇÔöÇ T┼éo wizualizera ÔÇö aurora blobs reaguj─ůce na energi─Ö ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    if (mode === 'tv') return
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
    let lastFrame = 0

    const draw = (ts = 0) => {
      const interval = 1000 / fpsRef.current
      if (ts - lastFrame < interval) { raf = requestAnimationFrame(draw); return }
      lastFrame = ts

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
      const dpr = Math.min(devicePixelRatio, 2)
      canvas.width  = Math.round(canvas.offsetWidth  * dpr)
      canvas.height = Math.round(canvas.offsetHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    raf = requestAnimationFrame(draw)

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ÔöÇÔöÇÔöÇ T┼éo aplikacji ÔÇö orby reaguj─ůce na energi─Ö muzyki ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    if (mode === 'tv') return
    const canvas = bgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    // 16 ma┼éych orb├│w rozsianych po ca┼éym ekranie
    // hue: odcie┼ä startowy (┬░), hs: pr─Ödko┼Ť─ç dryftu odcienia, sz: rozmiar bazowy
    const blobs = [
      // ÔÇö ciep┼ée pomara┼äcze (oryginalne) ÔÇö
      { x: 0.10, y: 0.08, vx:  0.00030, vy:  0.00020, hue: 20,  hs:  0.008, sz: 0.22 },
      { x: 0.50, y: 0.05, vx: -0.00025, vy:  0.00015, hue: 35,  hs: -0.006, sz: 0.17 },
      { x: 0.90, y: 0.12, vx: -0.00028, vy:  0.00022, hue: 25,  hs:  0.010, sz: 0.19 },
      { x: 0.20, y: 0.30, vx:  0.00022, vy: -0.00018, hue: 15,  hs: -0.007, sz: 0.24 },
      { x: 0.65, y: 0.28, vx: -0.00020, vy:  0.00025, hue: 30,  hs:  0.009, sz: 0.18 },
      { x: 0.85, y: 0.40, vx:  0.00018, vy: -0.00015, hue: 22,  hs: -0.008, sz: 0.20 },
      { x: 0.05, y: 0.52, vx:  0.00026, vy:  0.00012, hue: 28,  hs:  0.007, sz: 0.21 },
      { x: 0.38, y: 0.50, vx: -0.00015, vy: -0.00020, hue: 18,  hs: -0.009, sz: 0.26 },
      { x: 0.72, y: 0.55, vx:  0.00020, vy:  0.00018, hue: 32,  hs:  0.006, sz: 0.19 },
      { x: 0.95, y: 0.62, vx: -0.00024, vy: -0.00016, hue: 14,  hs: -0.007, sz: 0.16 },
      { x: 0.15, y: 0.72, vx:  0.00019, vy: -0.00022, hue: 26,  hs:  0.010, sz: 0.21 },
      { x: 0.48, y: 0.78, vx: -0.00022, vy:  0.00017, hue: 20,  hs: -0.008, sz: 0.23 },
      { x: 0.78, y: 0.75, vx:  0.00025, vy: -0.00019, hue: 33,  hs:  0.008, sz: 0.18 },
      { x: 0.30, y: 0.92, vx:  0.00021, vy: -0.00024, hue: 17,  hs: -0.006, sz: 0.20 },
      { x: 0.62, y: 0.95, vx: -0.00018, vy: -0.00020, hue: 24,  hs:  0.009, sz: 0.17 },
      { x: 0.92, y: 0.88, vx: -0.00020, vy: -0.00015, hue: 28,  hs: -0.007, sz: 0.19 },
      // ÔÇö dodatkowe kolory rozsiane po kole barw ÔÇö
      { x: 0.35, y: 0.15, vx:  0.00017, vy:  0.00023, hue: 80,  hs:  0.008, sz: 0.18 }, // ┼╝├│┼éto-zielony
      { x: 0.74, y: 0.08, vx: -0.00022, vy:  0.00018, hue: 140, hs: -0.007, sz: 0.20 }, // soczysty zielony
      { x: 0.08, y: 0.35, vx:  0.00025, vy:  0.00014, hue: 170, hs:  0.009, sz: 0.17 }, // mi─Öta / teal
      { x: 0.55, y: 0.38, vx: -0.00019, vy: -0.00021, hue: 195, hs: -0.008, sz: 0.21 }, // cyjan
      { x: 0.83, y: 0.22, vx:  0.00021, vy:  0.00016, hue: 220, hs:  0.006, sz: 0.19 }, // niebieski
      { x: 0.25, y: 0.60, vx: -0.00016, vy:  0.00024, hue: 245, hs: -0.009, sz: 0.22 }, // indygo
      { x: 0.58, y: 0.68, vx:  0.00023, vy: -0.00017, hue: 270, hs:  0.010, sz: 0.18 }, // fiolet
      { x: 0.42, y: 0.88, vx: -0.00020, vy: -0.00022, hue: 300, hs: -0.007, sz: 0.20 }, // magenta
      { x: 0.70, y: 0.85, vx:  0.00018, vy:  0.00019, hue: 325, hs:  0.008, sz: 0.17 }, // r├│┼╝owy
      { x: 0.12, y: 0.90, vx:  0.00024, vy: -0.00013, hue: 350, hs: -0.006, sz: 0.19 }, // malinowy / czerwony
    ]

    let smooth = 0
    let beat = 0
    let raf
    let lastFrame = 0

    const draw = (ts = 0) => {
      const interval = 1000 / fpsRef.current
      if (ts - lastFrame < interval) { raf = requestAnimationFrame(draw); return }
      lastFrame = ts

      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      const raw = electricEnergyRef.current || 0
      smooth += (raw - smooth) * (raw > smooth ? 0.10 : 0.04)
      beat   += (raw - beat)   * (raw > beat   ? 0.45 : 0.07)

      document.documentElement.style.setProperty('--card-alpha',    (0.76 - smooth * 0.42).toFixed(3))
      document.documentElement.style.setProperty('--card-blur',     `${(22 + smooth * 20).toFixed(1)}px`)
      document.documentElement.style.setProperty('--item-bg-alpha', (1.0  - smooth * 0.58).toFixed(3))

      ctx.globalCompositeOperation = 'screen'

      blobs.forEach((b) => {
        const speedMul = 1 + smooth * 3.5
        b.x += b.vx * speedMul; b.y += b.vy * speedMul
        if (b.x < -0.12 || b.x > 1.12) b.vx *= -1
        if (b.y < -0.12 || b.y > 1.12) b.vy *= -1

        b.hue = ((b.hue + b.hs + 360) % 360)
        const hue    = ((b.hue - smooth * 90 + 360) % 360)
        const radius = Math.min(w, h) * (b.sz + smooth * 0.18 + beat * 0.14)
        const alpha  = 0.06 + smooth * 0.38 + beat * 0.28

        const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, radius)
        g.addColorStop(0,    `hsla(${hue},92%,62%,${Math.min(alpha, 0.95).toFixed(3)})`)
        g.addColorStop(0.40, `hsla(${hue},85%,52%,${(alpha * 0.22).toFixed(3)})`)
        g.addColorStop(1,    `hsla(${hue},80%,40%,0)`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      })

      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(draw)
    }

    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2)
      canvas.width  = Math.round(canvas.offsetWidth  * dpr)
      canvas.height = Math.round(canvas.offsetHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    raf = requestAnimationFrame(draw)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', resize) }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ÔöÇÔöÇÔöÇ Thumbar ÔÇö ref zawsze aktualny, listenerzy rejestruj─ů si─Ö raz ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
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
    // TV Cast ÔÇö sync status from Chromecast back to app
    window.playerBridge.onCastStatus?.((data) => {
      if (!tvActiveDeviceRef.current) return
      const { playerState, currentTime } = data
      if (playerState === 'PAUSED') {
        setIsTrackPlaying(false)
      } else if (playerState === 'PLAYING') {
        setIsTrackPlaying(true)
      }
      if (typeof currentTime === 'number' && currentTime > 0) {
        setTrackTime(currentTime)
        if (playerRef.current) playerRef.current.currentTime = currentTime
      }
    })
    // TV Cast ÔÇö skip triggered from TV remote/UI
    window.playerBridge.onCastQueueSkip?.((data) => {
      if (!tvActiveDeviceRef.current) return
      if (data.direction === 'next') handleTrackNext(true)
      else handleTrackPrevious(true)
    })
    // Tryb t┼éa ÔÇö wy┼é─ůcz ci─Ö┼╝kie animacje CSS gdy okno nie jest aktywne
    window.playerBridge.onAppBackground?.((isBackground) => {
      document.documentElement.classList.toggle('app-background', isBackground)
      if (isBackground) { fpsRef.current = 6 } else if (document.visibilityState !== 'hidden') { fpsRef.current = document.hasFocus() ? 45 : 24 }
    })
  }, [])

  // ÔöÇÔöÇÔöÇ Zoom ÔÇö sync z main + blokada Ctrl+/-/0 ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
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

  useEffect(() => {
    async function checkYt() {
      const loggedIn = await window.playerBridge?.youtubeCheckLogin?.()
      setYtLoggedIn(!!loggedIn)
    }
    checkYt()
  }, [])

  // ÔöÇÔöÇÔöÇ Thumbar ÔÇö aktualizuj ikon─Ö play/pause ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    window.playerBridge?.setThumbarPlaying(
      mode === 'radio' ? isRadioPlaying : isTrackPlaying
    )
  }, [isTrackPlaying, isRadioPlaying, mode])

  // ÔöÇÔöÇÔöÇ Discord Rich Presence ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    if (!window.playerBridge) return
    const timer = setTimeout(() => {
      if (mode === 'player') {
        if (!isTrackPlaying || !currentTrack) {
          window.playerBridge.clearDiscordPresence()
          return
        }
        const elapsedMs = Math.max(0, Math.floor(Number(trackTimeRef.current || trackTime || 0))) * 1000
        const durationSeconds = Math.max(0, Math.floor(Number(trackDuration || currentTrack.seconds || 0)))
        const startTimestamp = Date.now() - elapsedMs
        const endTimestamp = durationSeconds > 0
          ? startTimestamp + (durationSeconds * 1000)
          : undefined
        const discordTrackArt = getDiscordTrackArt(currentTrack) || 'appicon'
        window.playerBridge.updateDiscordPresence({
          type: 2,
          name: currentTrack.title || 'Nieznany utw├│r',
          details: currentTrack.author || 'YouTube',
          state: 'Music App',
          largeImageKey: discordTrackArt,
          largeImageText: currentTrack.title || 'Music App',
          smallImageKey: 'appicon',
          smallImageText: 'byPerru',
          startTimestamp,
          endTimestamp,
        })
        return
      }

      if (mode === 'radio') {
        if (!isRadioPlaying || !currentStation) {
          window.playerBridge.clearDiscordPresence()
          return
        }
        window.playerBridge.updateDiscordPresence({
          type: 2,
          name: radioNowPlaying
            ? `${currentStation.name || 'Radio'} | ${radioNowPlaying}`
            : (currentStation.name || 'Radio'),
          details: radioNowPlaying || 'Kana┼é na ┼╝ywo',
          state: 'Music App',
          largeImageKey: sanitizeImageUrl(currentStation.favicon) || 'appicon',
          largeImageText: currentStation.name || 'Radio',
          smallImageKey: 'appicon',
          smallImageText: currentStation.name || 'Radio',
          startTimestamp: Date.now(),
        })
        return
      }

      if (mode === 'tv') {
        if (tvSubMode === 'channels') {
          if (!tvIsPlaying || !currentTvChannel) {
            window.playerBridge.clearDiscordPresence()
            return
          }
          const tvCountryCode = getTvChannelCountryCodes(currentTvChannel)[0] || currentTvChannel.country || ''
          const tvFlag = /^[A-Z]{2}$/.test(String(tvCountryCode || '').toUpperCase())
            ? countryFlagEmoji(tvCountryCode)
            : 'TV'
          window.playerBridge.updateDiscordPresence({
            type: 3,
            name: currentTvChannel.name || 'Kana┼é TV',
            details: tvCountryCode
              ? `${tvFlag} ${formatCountryCodeLabel(String(tvCountryCode).toUpperCase())}`
              : `${tvFlag} Kana┼é na ┼╝ywo`,
            state: 'Music App TV',
            largeImageKey: currentTvChannel.logo || 'appicon',
            largeImageText: `${tvFlag} ${currentTvChannel.name || 'TV'}`,
            smallImageKey: 'appicon',
            smallImageText: 'Music App TV',
            startTimestamp: Date.now(),
          })
          return
        }

        if (tvSubMode === 'youtube') {
          if (!tvYtPlaying || !tvYoutubeUrl) {
            window.playerBridge.clearDiscordPresence()
            return
          }
          window.playerBridge.updateDiscordPresence({
            type: 3,
            name: 'YouTube (TV)',
            details: tvYtTitle || 'YouTube na ┼╝ywo',
            state: 'Music App TV',
            largeImageKey: 'appicon',
            largeImageText: tvYtTitle || 'YouTube',
            smallImageKey: 'appicon',
            smallImageText: 'Music App TV',
            startTimestamp: Date.now(),
          })
          return
        }
      }

      window.playerBridge.clearDiscordPresence()
    }, 2000)
    return () => clearTimeout(timer)
  }, [
    mode,
    isTrackPlaying,
    isRadioPlaying,
    currentTrack,
    discordTrackSyncNonce,
    currentStation,
    radioNowPlaying,
    tvSubMode,
    tvIsPlaying,
    currentTvChannel,
    tvYtPlaying,
    tvYtTitle,
    tvYtThumbnail,
    tvYoutubeUrl,
  ])

  // ÔöÇÔöÇÔöÇ TV ÔÇö ┼éadowanie kana┼é├│w z iptv-org ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    if (mode !== 'tv' || tvSubMode !== 'channels') return
    const cat = TV_CATEGORIES.find(c => c.id === tvCategoryId)
    if (!cat) return
    let cancelled = false
    if (tvM3uAbortRef.current) tvM3uAbortRef.current.abort()
    const ctrl = new AbortController()
    tvM3uAbortRef.current = ctrl
    setTvLoading(true)
    const curatedWithCountryCodes = (cat.curated || []).map((ch) => ({
      ...ch,
      countryCodes: getTvChannelCountryCodes(ch)
    }))
    setTvChannels(curatedWithCountryCodes)
    const countryFallbackUrls = (cat.id === 'all' && /^[A-Z]{2}$/.test(tvCountryFilter))
      ? [
        `https://iptv-org.github.io/iptv/countries/${tvCountryFilter.toLowerCase()}.m3u`,
        ...(tvCountryFilter === 'PL' ? ['https://iptv-org.github.io/iptv/languages/pol.m3u'] : [])
      ]
      : []
    const feedUrls = [...new Set([cat.url, ...(cat.extraUrls || []), ...countryFallbackUrls].filter(Boolean))]
    Promise.allSettled(feedUrls.map((url) => fetch(url, { signal: ctrl.signal }).then((r) => r.text())))
      .then((results) => {
        if (!cancelled) {
          const parsed = results.flatMap((entry, index) => {
            if (entry.status !== 'fulfilled') return []
            const sourceUrl = feedUrls[index] || ''
            const hintCountry = isLikelyPolishFeed(sourceUrl) ? 'PL' : ''
            return parseM3U(entry.value).map((ch) => ({
              ...ch,
              feedHintCountry: hintCountry,
            }))
          })
          const uniqueParsed = dedupeTvChannels(parsed)
          const categoryFiltered = cat.keywordFilter
            ? uniqueParsed.filter((ch) => cat.keywordFilter.test(`${ch.name || ''} ${ch.id || ''}`))
            : uniqueParsed
          const countryHintFiltered = Array.isArray(cat.countryHints) && cat.countryHints.length > 0
            ? categoryFiltered.filter((ch) => {
              if (cat.countryHints.includes('PL')) return isLikelyPolishTvChannel(ch)
              const channelCountries = getTvChannelCountryCodes(ch)
              return channelCountries.some((code) => cat.countryHints.includes(code))
            })
            : categoryFiltered
          // Deduplikuj: usu┼ä kana┼éy kt├│re ju┼╝ s─ů w curated (po nazwie)
          const curatedNames = new Set(curatedWithCountryCodes.map(c => c.name.toLowerCase()))
          const extra = countryHintFiltered.filter(ch => !curatedNames.has(ch.name.toLowerCase()))
          setTvChannels(dedupeTvChannels([...curatedWithCountryCodes, ...extra]))
          setTvLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Nawet bez sieci poka┼╝ curated
          if (curatedWithCountryCodes.length > 0) setTvChannels(curatedWithCountryCodes)
          setTvLoading(false)
        }
      })
    return () => {
      cancelled = true
      ctrl.abort()
      if (tvM3uAbortRef.current === ctrl) tvM3uAbortRef.current = null
    }
  }, [mode, tvSubMode, tvCategoryId, tvCountryFilter])

  // ÔöÇÔöÇÔöÇ TV ÔÇö ustaw g┼éo┼Ťno┼Ť─ç + auto-seek do live-15s przy za┼éadowaniu ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    if (mode !== 'tv' || tvSubMode !== 'channels' || !currentTvChannel) { setTvIsPlaying(false); return }
    setTvPlayerError(false)
    setTvIsPlaying(false)
    tvAutoRetryRef.current = 0
    setTvHasDvr(false)
    setTvSeekableStart(0)
    setTvSeekableEnd(0)
    setTvCurrentTime(0)
    const t = setTimeout(() => {
      const el = tvVideoRef.current
      if (!el) return
      el.volume = toEffectiveVolume(volumePercent, 'log')
      el.play?.().catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [mode, tvSubMode, currentTvChannel, volumePercent])

  // ÔöÇÔöÇÔöÇ TV ÔÇö DVR tracking (co 2s, ┼╝eby nie lagowa─ç) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    if (!tvIsPlaying) return
    const tick = () => {
      const el = tvVideoRef.current
      if (!el || el.seekable.length === 0) return
      const start = el.seekable.start(0)
      const end   = el.seekable.end(0)
      setTvCurrentTime(el.currentTime)
      const now = Date.now()
      if (Math.abs((tvLastProgressRef.current.time ?? 0) - el.currentTime) > 0.2) {
        tvLastProgressRef.current = { time: el.currentTime, at: now }
      } else if (now - (tvLastProgressRef.current.at || 0) > 15000) {
        // Stream stoi >15s mimo stanu playing ÔÇö spr├│buj auto-recovery.
        recoverTvStream()
        tvLastProgressRef.current.at = now
      }
      setTvSeekableStart(start)
      setTvSeekableEnd(end)
      setTvHasDvr(end - start > 20)
    }
    tick() // natychmiast przy starcie
    const interval = setInterval(tick, 2000)
    return () => clearInterval(interval)
  }, [tvIsPlaying, currentTvChannel, recoverTvStream])

  // Gdy opuszczasz TV/channels, zwolnij twardo zasoby elementu video.
  useEffect(() => {
    if (mode === 'tv' && tvSubMode === 'channels' && currentTvChannel) return
    if (tvRecoverTimerRef.current) {
      clearTimeout(tvRecoverTimerRef.current)
      tvRecoverTimerRef.current = null
    }
    const el = tvVideoRef.current
    if (!el) return
    try {
      el.pause?.()
      el.removeAttribute?.('src')
      el.src = ''
      el.load?.()
    } catch {}
  }, [mode, tvSubMode, currentTvChannel])

  useEffect(() => {
    return () => {
      if (tvRecoverTimerRef.current) clearTimeout(tvRecoverTimerRef.current)
      tvRecoverTimerRef.current = null
      if (tvM3uAbortRef.current) tvM3uAbortRef.current.abort()
      tvM3uAbortRef.current = null
    }
  }, [])

  // ÔöÇÔöÇÔöÇ TV YouTube ÔÇö nas┼éuch wiadomo┼Ťci IFrame API ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    if (tvSubMode !== 'youtube' || !tvYoutubeUrl) return
    function onMsg(e) {
      if (typeof e.data !== 'string') return
      try {
        const d = JSON.parse(e.data)
        if (d.event === 'initialDelivery' || d.event === 'infoDelivery') {
          const info = d.info || {}
          if (typeof info.currentTime === 'number') setTvYtCurrentTime(info.currentTime)
          if (typeof info.duration === 'number' && info.duration > 0) setTvYtDuration(info.duration)
          if (typeof info.playerState === 'number') setTvYtPlaying(info.playerState === 1)
          if (d.event === 'initialDelivery') {
            if (info.videoData?.title) setTvYtTitle(info.videoData.title)
            // Ustaw g┼éo┼Ťno┼Ť─ç aplikacji w playerze YouTube
            tvYtIframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'setVolume', args: [tvYtVolRef.current] }),
              'https://www.youtube-nocookie.com'
            )
          }
        }
      } catch {}
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [tvSubMode, tvYoutubeUrl])

  // ÔöÇÔöÇÔöÇ TV YouTube ÔÇö sync g┼éo┼Ťno┼Ťci z aplikacji ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => { tvYtVolRef.current = volumePercent }, [volumePercent])
  useEffect(() => {
    if (tvSubMode !== 'youtube' || !tvYoutubeUrl) return
    tvYtIframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [volumePercent] }),
      'https://www.youtube-nocookie.com'
    )
  }, [volumePercent, tvSubMode, tvYoutubeUrl])

  // ÔöÇÔöÇÔöÇ TV YouTube ÔÇö thumbnail z video ID ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    if (!tvYoutubeUrl) { setTvYtTitle(''); setTvYtThumbnail(''); setTvYtCurrentTime(0); setTvYtDuration(0); setTvYtPlaying(false); return }
    const id = getYoutubeVideoId(tvYoutubeUrl)
    setTvYtThumbnail(id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '')
    setTvYtCurrentTime(0); setTvYtDuration(0); setTvYtPlaying(false); setTvYtTitle('')
  }, [tvYoutubeUrl])

  // ÔöÇÔöÇÔöÇ Historia odtwarzania (localStorage, 2 dni) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    if (!currentTrack?.id) return
    setTrackHistory((prev) => {
      const entry = { track: currentTrack, ts: Date.now() }
      const updated = [entry, ...prev.filter((e) => e.track.id !== currentTrack.id)].slice(0, 40)
      saveHistory(updated)
      return updated
    })
  }, [currentTrack])

  // ÔöÇÔöÇÔöÇ Podpowiedzi w wyszukiwarce ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
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

  // ÔöÇÔöÇÔöÇ Auto-scroll do aktywnego utworu ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    if (mode !== 'player') return
    activeTrackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [currentTrack, mode])

  useEffect(() => {
    const trackUrl = String(currentTrack?.url || '').trim()
    if (mode !== 'player' || !trackUrl) {
      setTrackStreamUrl('')
      return
    }
    setTrackStreamUrl(trackUrl)
    setTrackError('')
  }, [mode, currentTrack?.id, currentTrack?.url])

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

  const tvCountryOptions = useMemo(() => {
    const fromChannels = tvChannels.flatMap((ch) => getTvChannelCountryCodes(ch))
    const merged = [...new Set([...fromChannels, ...TV_COMMON_COUNTRY_CODES])]
    return merged
      .filter((code) => /^[A-Z]{2}$/.test(code))
      .sort((a, b) => formatCountryCodeLabel(a).localeCompare(formatCountryCodeLabel(b), 'pl'))
  }, [tvChannels])

  const tvVisibleCountryOptions = useMemo(() => {
    const q = normalizeCountryToken(tvCountrySearch)
    if (!q) return tvCountryOptions
    return tvCountryOptions.filter((code) => {
      const label = normalizeCountryToken(formatCountryCodeLabel(code))
      return code.toLowerCase().includes(q) || label.includes(q)
    })
  }, [tvCountryOptions, tvCountrySearch])

  // Reset widocznej liczby stacji gdy lista si─Ö zmienia
  useEffect(() => {
    setVisibleStationCount(40)
  }, [stationSearchTerm, radioTagFilter, countryFilter, libraryView])

  // IntersectionObserver ÔÇö dok┼éadaj 40 stacji gdy sentinel wchodzi w viewport
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
  // Przewi┼ä na g├│r─Ö i resetuj stron─Ö gdy zmienia si─Ö zawarto┼Ť─ç
  useEffect(() => {
    if (libraryListRef.current) libraryListRef.current.scrollTop = 0
    setTrackPage(0)
  }, [allTracks, filters, libraryView])

  // Szybsze i p┼éynne scrollowanie listy
  useEffect(() => {
    const el = libraryListRef.current
    if (!el) return
    let target = el.scrollTop
    let raf = null
    let scrollbarDragging = false

    const step = () => {
      const diff = target - el.scrollTop
      if (Math.abs(diff) < 1) { el.scrollTop = target; raf = null; return }
      el.scrollTop += diff * 0.18
      raf = requestAnimationFrame(step)
    }

    const onWheel = (e) => {
      e.preventDefault()
      target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target + e.deltaY * 1.5))
      if (raf) return
      raf = requestAnimationFrame(step)
    }

    // Wykryj klikni─Öcie na scrollbarze (jest za clientWidth)
    const onPointerDown = (e) => {
      if (e.offsetX > el.clientWidth) {
        scrollbarDragging = true
        if (raf) { cancelAnimationFrame(raf); raf = null }
        target = el.scrollTop
      }
    }
    const onPointerUp = () => { scrollbarDragging = false }

    // Sync target gdy natywny scroll (klawiatura, touch, scrollbar drag)
    const onScroll = () => {
      if (scrollbarDragging) { target = el.scrollTop; return }
      // wheel-driven scroll: target ju┼╝ ustawiony, ignoruj
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Auto-przesu┼ä stron─Ö gdy aktywny utw├│r jest poza widocznym zakresem
  useEffect(() => {
    if (!currentTrack || mode !== 'player') return
    const idx = visibleTracks.findIndex(t => t.id === currentTrack.id)
    if (idx < 0) return
    const page = Math.floor(idx / PAGE_SIZE)
    setTrackPage(p => p === page ? p : page)
  }, [currentTrack?.id])

  const activeItem = mode === 'radio' ? currentStation : currentTrack
  const currentRadioStreamEntry = stationStreams[stationStreamIndex] || null
  const currentRadioStreamUrl = currentRadioStreamEntry?.url || currentStation?.url || ''

  // ÔöÇÔöÇÔöÇ Ping do stacji radiowej ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
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
  const currentTitle = activeItem?.title || activeItem?.name || 'Wybierz co┼Ť do odpalenia'
  const isRadioVisualLoading = mode === 'radio' && (radioLoading || isSwitchingStationStream || isRadioBuffering)
  const shouldShowRadioErrorStatus = mode === 'radio' && Boolean(radioError) && !isRadioVisualLoading
  const fallbackStatusMatch = shouldShowRadioErrorStatus
    ? String(radioError).match(/^Radio\s+(.+?)\s+nie dzia┼éa, odpalamy stacj─Ö podstawow─ů\.?$/i)
    : null
  const fallbackStationName = fallbackStatusMatch?.[1] || ''
  const isAlreadyOnStationStatus = /^Ju┼╝ jeste┼Ť na tej stacji\.?$/i.test(String(radioError || '').trim())
  const radioVisualizerStatus = shouldShowRadioErrorStatus
    ? radioError
    : (!currentStation
    ? 'Wybierz stacj─Ö'
    : (isRadioVisualLoading ? '┼üadowanie stacji...' : (!isRadioPlaying ? 'Radio zatrzymane' : '')))

  const playerArt = mode === 'radio'
    ? safeArt(currentStation?.favicon, currentStation?.name || activeGenre.label, 'radio')
    : safeArt(currentTrack?.thumbnail, currentTrack?.title || activeGenre.label, 'track')

  const playerFlag = mode === 'radio' ? countryFlagEmoji(currentStation?.countryCode) : 'YT'
  const shouldScrollTitle = currentTitle.length > 42

  useEffect(() => {
    localStorage.setItem('hiphop-player-favorites', JSON.stringify(favorites))
  }, [favorites])

  // Zapisuj g┼éo┼Ťno┼Ť─ç do localStorage przy ka┼╝dej zmianie + synchronizuj d┼║wi─Öki UI
  useEffect(() => {
    localStorage.setItem('hiphop-player-volume', String(volumePercent))
    setUiVolume(volumePercent)
  }, [volumePercent])


  // Global radio search (radio-browser.info, ca┼éy ┼Ťwiat)
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
        setRgResults(dedupeById(raw.filter(s => s.urlResolved || s.url).map(normalizeStation).filter(Boolean)))
      } catch { setRgResults([]) }
      finally { setRgLoading(false) }
    }, 400)
  }, [stationSearchTerm, radioGardenMode, rgCountry, radioTagFilter])

  // Zapisuj ostatni─ů stacj─Ö do localStorage przy ka┼╝dej zmianie currentStation
  useEffect(() => {
    if (currentStation && currentStation.id) {
      localStorage.setItem('hiphop-player-last-station', JSON.stringify(currentStation))
    }
  }, [currentStation])

  useEffect(() => {
    effectiveVolumeRef.current = effectiveVolume

    if (audioRef.current) {
      // Gdy gain node jest aktywny, on kontroluje g┼éo┼Ťno┼Ť─ç ÔÇö audio element musi by─ç na 1
      // ┼╝eby nie mno┼╝y─ç g┼éo┼Ťno┼Ťci przez siebie (effectiveVolume * effectiveVolume = effectiveVolume┬▓)
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
            .map(normalizeStation)
            .filter(Boolean),
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
            setRadioError('Nie znalaz┼éem stacji w tym klimacie. Spr├│buj inny gatunek.')
          }
        }
      } catch {
        if (!ignore) {
          setRadioError('Nie uda┼éo si─Ö pobra─ç stacji dla tego klimatu.')
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
            .map(normalizeStation)
            .filter(Boolean),
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
        setTrackError('Wyszukiwanie YouTube dzia┼éa tylko po uruchomieniu przez Electron.')
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
            setTrackError('Nie znalaz┼éem pojedynczych utwor├│w dla tego klimatu.')
          }
        }
      } catch {
        if (!ignore) {
          setTrackError('Nie uda┼éo si─Ö pobra─ç wynik├│w YouTube.')
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

    // ÔöÇÔöÇ TRYB PLAYER ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
    // Loopback stream dla player mode jest zarz─ůdzany przez osobny useEffect([mode])
    if (mode !== 'radio') return

    // ÔöÇÔöÇ RADIO ZATRZYMANE / BRAK ELEMENTU ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
    if (!audioElement || !isRadioPlaying) {
      disconnectAudioMotion()
      return
    }

    // ÔöÇÔöÇ RADIO GRA ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
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
          // Pod┼é─ůcz wizualizer przed gain nodem (po kompresorze) ÔÇö niezale┼╝ny od g┼éo┼Ťno┼Ťci
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

  // ÔöÇÔöÇ PLAYER MODE: loopback audio Ôćĺ wizualizer (pod┼é─ůcz gdy gra, od┼é─ůcz gdy pauza) ÔöÇÔöÇ
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
      if (loopbackStreamRef.current) {
        loopbackStreamRef.current.getTracks().forEach(t => t.stop())
        loopbackStreamRef.current = null
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

  // Auto-recast to active TV when station / stream changes
  useEffect(() => {
    const dev = tvActiveDeviceRef.current
    if (!dev || !currentRadioStreamUrl || !currentStation) return
    const key = `${currentRadioStreamUrl}|${currentStation.id}`
    if (key === tvLastCastKeyRef.current) return
    tvLastCastKeyRef.current = key
    const t = setTimeout(() => {
      window.playerBridge?.tvCast?.({
        ip:          dev.ip,
        port:        dev.port,
        streamUrl:   currentRadioStreamUrl,
        stationName: currentStation.name,
        stationArt:  currentStation.favicon || '',
        currentSong: radioNowPlayingRef.current || '',  // ref = always fresh
      }).catch?.(() => {})
    }, 700)
    return () => clearTimeout(t)
  }, [currentRadioStreamUrl, currentStation?.id])

  // Keep radioNowPlayingRef in sync so auto-recast stale closure has current value
  useEffect(() => { radioNowPlayingRef.current = radioNowPlaying }, [radioNowPlaying])

  // Note: Chromecast does not support metadata-only updates (no LOAD = no title update).
  // Updating metadata via LOAD restarts the stream (audio gap). We skip this intentionally.
  // Station changes are handled by the effect above (full recast on URL/id change).

  // Auto-recast YouTube track when song changes and TV is connected
  useEffect(() => {
    if (!tvActiveDeviceRef.current || !currentTrack?.url || mode !== 'player') return
    const dev = tvActiveDeviceRef.current
    // Pause local briefly so TV has time to buffer (avoids ~1.5s desync)
    setIsTrackPlaying(false)
    const resumeTimer = setTimeout(() => setIsTrackPlaying(true), 1500)
    const currentIndex = visibleTracks.findIndex(t => t.id === currentTrack.id)
    const prevTrack = currentIndex > 0 ? visibleTracks[currentIndex - 1] : null
    const nextTrack = currentIndex >= 0 && currentIndex < visibleTracks.length - 1 ? visibleTracks[currentIndex + 1] : null
    window.playerBridge?.tvCastYt?.({
      ip:         dev.ip,
      port:       dev.port,
      youtubeUrl: currentTrack.url,
      title:      currentTrack.title || 'YouTube',
      author:     currentTrack.author || '',
      artUrl:     currentTrack.thumbnail || currentTrack.art || '',
      prevTrack:  prevTrack ? { url: prevTrack.url, title: prevTrack.title, author: prevTrack.author, thumbnail: prevTrack.thumbnail || prevTrack.art } : null,
      nextTrack:  nextTrack ? { url: nextTrack.url, title: nextTrack.title, author: nextTrack.author, thumbnail: nextTrack.thumbnail || nextTrack.art } : null,
    }).catch?.(() => {})
    return () => clearTimeout(resumeTimer)
  }, [currentTrack?.id])

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

  // Preload 20 kolejnych utwor├│w gdy dojdziemy do ostatniego w li┼Ťcie
  useEffect(() => {
    if (mode !== 'player' || !currentTrack || loadingMoreTracks) return
    const idx = visibleTracks.findIndex((t) => t.id === currentTrack.id)
    if (idx !== visibleTracks.length - 1 || visibleTracks.length === 0) return
    const key = `${currentTrack.id}-${visibleTracks.length}`
    if (preloadedForRef.current === key) return
    preloadedForRef.current = key
    loadMoreTracks(20).catch(() => {})
  }, [currentTrack?.id, visibleTracks.length, loadingMoreTracks, mode])

  // Interwa┼é czasu ÔÇö ┼Ťled┼║ pozycj─Ö odtwarzania
  useEffect(() => {
    if (mode !== 'player') return undefined
    const interval = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return
      const nextTime = Number(player.currentTime ?? 0)
      const nextDuration = Number(player.duration ?? 0)
      if (Number.isFinite(nextTime) && !isSeekingRef.current) {
        trackTimeRef.current = nextTime
        setTrackTime(nextTime)
      }
      if (Number.isFinite(nextDuration) && nextDuration > 0) setTrackDuration(nextDuration)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [mode])

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

  // Zwraca true je┼Ťli akcja jest dozwolona; false + toast je┼Ťli zablokowana
  function checkPerm(perm) {
    if (!inSession || isHost) return true
    if (myPermissions[perm]) return true
    const labels = { canPlay: 'uprawnienia moderatora', canSkip: 'uprawnienia moderatora', canAdd: 'uprawnienia moderatora' }
    showSessionToast(`Tylko host mo┼╝e ${labels[perm] ?? 'to zrobi─ç'} ÔÇö popro┼Ť o uprawnienia`)
    return false
  }

  function updateMode(nextMode, remote = false) {
    if (!remote && inSession && !isHost && nextMode !== mode) {
      showSessionToast('Tylko host mo┼╝e zmienia─ç zak┼éadki podczas sesji')
      return
    }
    // Opuszczamy zak┼éadk─Ö TV ÔÇö zatrzymaj expand/fullscreen i zwolnij RAM
    if (mode === 'tv' && nextMode !== 'tv') {
      if (tvRecoverTimerRef.current) {
        clearTimeout(tvRecoverTimerRef.current)
        tvRecoverTimerRef.current = null
      }
      if (tvM3uAbortRef.current) {
        tvM3uAbortRef.current.abort()
        tvM3uAbortRef.current = null
      }
      const el = tvVideoRef.current
      if (el) {
        try {
          el.pause?.()
          el.removeAttribute?.('src')
          el.src = ''
          el.load?.()
        } catch {}
      }
      if (tvExpandMode !== 'normal') {
        window.playerBridge?.setWindowFullscreen?.(false)
      }
      setTvExpandMode('normal')
      setTvChannels([])
      setCurrentTvChannel(null)
      setTvIsPlaying(false)
      setTvStreamNonce(0)
      setTvYoutubeUrl('')
      setTvYoutubeInput('')
    }
    setMode(nextMode)
    if (nextMode === 'radio') setLyricsVisible(false)
    localStorage.setItem('hiphop-player-mode', nextMode)
    setLibraryView('all')
    setStationSearchTerm('')
    if (!remote && inSession) notifyAction('modeChange', { mode: nextMode })
  }

  function applyTvYoutubeUrl(nextUrl, remote = false) {
    if (!remote && !checkPerm('canAdd')) return
    const clean = (nextUrl || '').trim()
    setTvYoutubeInput(clean)
    if (!isValidYoutubeUrl(clean)) return
    setTvSubMode('youtube')
    setCurrentTvChannel(null)
    setTvYoutubeUrl(clean)
    setTvPlayerError(false)
    if (!remote && inSession) notifyAction('tvStateChange', { subMode: 'youtube', youtubeUrl: clean })
  }

  // Zapisuj tryb do localStorage przy ka┼╝dej zmianie
  useEffect(() => {
    localStorage.setItem('hiphop-player-mode', mode)
  }, [mode])

  // Zapisuj filtry do localStorage przy ka┼╝dej zmianie
  useEffect(() => {
    localStorage.setItem('hiphop-player-trackfilters', JSON.stringify(filters))
  }, [filters])

  async function handleTrackSearch(event) {
    event.preventDefault()

    if (!searchTerm.trim()) return

    if (!window.playerBridge?.searchYoutube) {
      setTrackError('Wyszukiwanie YouTube dzia┼éa tylko po uruchomieniu przez Electron.')
      return
    }

    setTrackLoading(true)
    setTrackError('')

    // Wykryj link do playlisty YouTube ÔÇö za┼éaduj wszystkie utwory
    const plId = extractYoutubePlaylistId(searchTerm.trim())
    if (plId && window.playerBridge.getPlaylist) {
      try {
        const result = await window.playerBridge.getPlaylist(plId)
        const tracks = Array.isArray(result) ? result : (result?.tracks ?? [])
        const err = result?.error
        if (tracks.length > 0) {
          const filtered = filterPlayableTracks(tracks)
          setSearchResults(filtered)
          setActiveTrackQuery(`Playlista (${filtered.length} utwor├│w)`)
          selectTrack(filtered[0], true, false)
          if (err && tracks.length < 500) setTrackError(`Wczytano ${filtered.length} z mo┼╝liwych ÔÇö reszta niedost─Öpna.`)
        } else {
          if (err === 'quota') setTrackError('Przekroczono dzienny limit API YouTube. Spr├│buj za kilka godzin.')
          else if (err === 'private') setTrackError('Playlista jest prywatna lub niedost─Öpna.')
          else if (err === 'not_found') setTrackError('Nie znaleziono playlisty pod tym adresem.')
          else setTrackError('Nie uda┼éo si─Ö za┼éadowa─ç playlisty. Sprawd┼║ link i spr├│buj ponownie.')
        }
      } catch {
        setTrackError('B┼é─ůd po┼é─ůczenia podczas ┼éadowania playlisty.')
      } finally {
        setTrackLoading(false)
      }
      return
    }

    // Wykryj link YouTube ÔÇö za┼éaduj konkretne wideo (dzia┼éa te┼╝ dla live)
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
        setTrackError('Nie uda┼éo si─Ö pobra─ç informacji o wideo.')
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
        setTrackError('Brak kr├│tkich pojedynczych utwor├│w. Zmie┼ä fraz─Ö i spr├│buj jeszcze raz.')
      }
    } catch {
      setTrackError('Szukajka YouTube chwilowo nie odpowiedzia┼éa.')
    } finally {
      setTrackLoading(false)
    }
  }

  function selectStation(station, options = {}) {
    if (currentStation?.id && station?.id && currentStation.id === station.id) {
      setRadioError('Ju┼╝ jeste┼Ť na tej stacji.')
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
        setRadioError(`Stream ${checkedNow}/${primaryTotal} nie dzia┼éa. Pr├│buj─Ö ${tryingIndex}/${primaryTotal}...`)
        return
      }

      if (stationStreamIndex === primaryTotal - 1 && stationStreams.length > primaryTotal) {
        const nextEntry = stationStreams[primaryTotal]
        setStationStreamIndex(primaryTotal)
        setRadioError(`Sprawdzi┼éem ${primaryTotal}/${primaryTotal}. Pr├│buj─Ö wariant ${nextEntry?.label || '128'}...`)
        return
      }

      if (stationStreamIndex >= primaryTotal && stationStreamIndex < stationStreams.length - 1) {
        const nextEntry = stationStreams[stationStreamIndex + 1]
        setStationStreamIndex((previous) => previous + 1)
        setRadioError(`Wariant ${currentRadioStreamEntry?.label || currentStation?.name || 'stacji'} nie dzia┼éa. Pr├│buj─Ö ${nextEntry?.label || 'nast─Öpny wariant'}...`)
        return
      }

      // Wszystkie streamy wyczerpane ÔÇö zatrzymaj i wyczy┼Ť─ç src
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current.load()
      }
      setIsRadioPlaying(false)
      setIsRadioBuffering(false)

      // Je┼Ťli go┼Ť─ç jest w sesji ÔÇö automatycznie spr├│buj ponownie po 5s (max 3 razy)
      if (inSession && !isHost && currentStation && sessionReconnectCountRef.current < 3) {
        sessionReconnectCountRef.current += 1
        setRadioError(`Po┼é─ůczenie przerwane, ponawiam za 5s... (${sessionReconnectCountRef.current}/3)`)
        if (sessionReconnectTimerRef.current) clearTimeout(sessionReconnectTimerRef.current)
        sessionReconnectTimerRef.current = setTimeout(() => {
          if (currentStation) selectStation(currentStation)
        }, 5000)
      } else {
        sessionReconnectCountRef.current = 0
        setRadioError(`Nie mo┼╝na po┼é─ůczy─ç z ${currentStation?.name || 't─ů stacj─ů'}. Spr├│buj klikn─ů─ç stacj─Ö ponownie lub wybierz inn─ů.`)
      }
    } finally {
      setIsSwitchingStationStream(false)
    }
  }

  async function loadMyPlaylists() {
    setMyPlaylistsLoading(true)
    try {
      const result = await window.playerBridge?.youtubeGetPlaylists?.()
      setMyPlaylists(result?.playlists ?? [])
      if (result?.error === 'not_logged_in') setYtLoggedIn(false)
    } finally {
      setMyPlaylistsLoading(false)
    }
  }

  function selectTrack(track, autoplay = true, notify = false) {
    setCurrentTrack(track)
    setTrackError('')
    trackTimeRef.current = 0
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
      setTrackError('Najpierw wybierz utw├│r z listy.')
      return
    }

    const nextPlaying = !isTrackPlaying
    setIsTrackPlaying(nextPlaying)
    if (tvActiveDeviceRef.current && mode === 'player') {
      if (nextPlaying) window.playerBridge?.tvResume?.()
      else window.playerBridge?.tvPause?.()
    }
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

    // Kolejka sugestii ÔÇö host (lub poza sesj─ů) gra sugerowane w pierwszej kolejno┼Ťci
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
        setTrackError('Brak kolejnych utwor├│w dla tej frazy. Spr├│buj innej wyszukiwarki.')
      }
    } catch {
      setTrackError('Nie uda┼éo si─Ö pobra─ç kolejnych utwor├│w.')
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
    // Aktualizuj wizual bezpo┼Ťrednio przez DOM ÔÇö zero re-render├│w podczas przeci─ůgania
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
    trackTimeRef.current = nextTime
    setTrackTime(nextTime)
    setDiscordTrackSyncNonce((value) => value + 1)
    if (playerRef.current) playerRef.current.currentTime = nextTime
    if (tvActiveDeviceRef.current && mode === 'player') {
      window.playerBridge?.tvSeek?.({ currentTime: nextTime })
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
    // Aktualizuj wizual i audio bezpo┼Ťrednio ÔÇö bez re-renderu
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
    if (tvVideoRef.current) tvVideoRef.current.volume = eff
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
    syncTvPositionNow,
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
    tvSubMode,
    tvYoutubeUrl,
    tvYtCurrentTime,
    tvYtPlaying,
    nickname: myNickname,
    onRemoteStationChange: (stationData) => {
      if (!stationData?.id) return
      selectStation(stationData)
    },
    onRemoteTrackChange: (trackData) => {
      setCurrentTrack(trackData)
      setIsTrackReady(false)
      trackTimeRef.current = trackData.position ?? 0
      setTrackTime(trackData.position ?? 0)
      setDiscordTrackSyncNonce((value) => value + 1)
      setIsTrackPlaying(trackData.playing ?? true)
      pendingRemoteSeekRef.current = trackData.position > 0 ? trackData.position : null
    },
    onRemoteSeek: (time) => {
      pendingRemoteSeekRef.current = time
      trackTimeRef.current = time
      if (!playerRef.current) return
      playerRef.current.currentTime = time
      setTrackTime(time)
      setDiscordTrackSyncNonce((value) => value + 1)
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
    onRemoteTvStateChange: (tvData) => {
      if (!tvData) return
      const nextSubMode = tvData.subMode ?? 'channels'
      setTvSubMode(nextSubMode)
      if (nextSubMode === 'youtube') {
        const nextUrl = tvData.youtubeUrl ?? ''
        setTvYoutubeInput(nextUrl)
        setTvYoutubeUrl(nextUrl)
        setTvPlayerError(false)
      }
    },
    onRemoteTvSeek: (position) => {
      if (!Number.isFinite(Number(position))) return
      const pos = Math.max(0, Number(position))
      setTvYtCurrentTime(pos)
      tvYtIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [pos, true] }),
        'https://www.youtube-nocookie.com'
      )
    },
    onRemoteTvPlayPause: (playing) => {
      setTvYtPlaying(!!playing)
      const iframe = tvYtIframeRef.current
      if (!iframe) return
      const func = playing ? 'playVideo' : 'pauseVideo'
      iframe.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args: '' }),
        'https://www.youtube-nocookie.com'
      )
    },
    onActionNotification: (nick, type, payload) => {
      const sysVerb = {
        playPause: payload.playing
          ? `ÔľÂ ${nick} wznowi┼é ${payload.mode === 'radio' ? 'radio' : 'odtwarzanie'}`
          : `ÔĆŞ ${nick} wstrzyma┼é ${payload.mode === 'radio' ? 'radio' : 'odtwarzanie'}`,
        trackChange: `­čÄÁ ${nick} w┼é─ůczy┼é: ${payload.title ?? ''}`,
        modeChange: `­čöä ${nick} prze┼é─ůczy┼é na ${payload.mode === 'radio' ? 'Radio' : payload.mode === 'player' ? 'Player' : 'TV'}`,
        stationChange: `­čô╗ ${nick} zmieni┼é stacj─Ö: ${payload.name ?? ''}`,
        tvStateChange: `­čô║ ${nick} uruchomi┼é YouTube w TV`,
        tvPlayPause: payload.playing ? `ÔľÂ ${nick} wznowi┼é TV` : `ÔĆŞ ${nick} wstrzyma┼é TV`,
        tvSeek: `ÔĆę ${nick} przewin─ů┼é TV`,
      }
      const text = sysVerb[type]
      if (text) sendSysMsgRef.current?.(text)
      showSessionToast(text?.replace(/^[^ ]+ /, '') ?? `${nick} wykona┼é akcj─Ö`)
    },
  })

  // Zawsze aktualny ref do sendSystemMessage (u┼╝ywany w onActionNotification przed inicjalizacj─ů)
  sendSysMsgRef.current = sendSystemMessage

  const handleItemSelect = useCallback((item) => {
    if (mode === 'radio') {
      if (!checkPerm('canSkip') && !checkPerm('canAdd')) return
      selectStation(item)
      if (inSession) notifyAction('stationChange', { id: item.id ?? '', name: item.name ?? '', url: item.url ?? '', country: item.country ?? '', countrycode: item.countrycode ?? '', favicon: item.favicon ?? '', tags: item.tags ?? '', codec: item.codec ?? '', bitrate: item.bitrate ?? 0, lastSong: item.lastSong ?? '' })
      return
    }
    if (!checkPerm('canAdd')) return
    selectTrack(item, true, true)
  }, [mode, checkPerm, selectStation, selectTrack, inSession, notifyAction])

  const handleItemSuggest = useCallback((e, item) => {
    e.stopPropagation()
    if (!suggestedIds.has(item.id)) handleSuggest(item)
  }, [suggestedIds, handleSuggest])

  // Reset po zako┼äczeniu sesji
  useEffect(() => {
    if (!inSession) {
      setSuggestedIds(new Set())
      setChatUnread(0)
      setLibraryView((v) => (v === 'chat') ? 'all' : v)
    }
  }, [inSession])

  // Kolejka: w sesji u┼╝ywamy Firebase (sessionSuggestions), poza sesj─ů ÔÇö lokaln─ů
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

  // Monopoly: auto-otw├│rz dla klienta gdy host zacznie gr─Ö
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
      // Auto-open for color_pick AND playing ÔÇö once per session
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

  // Podobne: od┼Ťwie┼╝ gdy kolejka uro┼Ťnie o 3 elementy
  useEffect(() => {
    if (activeQueue.length === 0) return
    if (activeQueue.length - lastSimilarQueueLengthRef.current >= 3) {
      lastSimilarQueueLengthRef.current = activeQueue.length
      setRefreshSimilarTrigger((n) => n + 1)
    }
  }, [activeQueue.length])

  // System messages dla do┼é─ůczenia/wyj┼Ťcia s┼éuchaczy (tylko host wysy┼éa)
  const prevListenersRef = useRef([])
  useEffect(() => {
    if (!inSession) { prevListenersRef.current = []; return }
    const prev = prevListenersRef.current
    const curr = sessionListeners
    if (isHost) {
      curr.forEach(l => {
        if (!prev.find(p => p.key === l.key))
          sendSystemMessage(`­čĹĄ ${l.nickname} do┼é─ůczy┼é do sesji`)
      })
      prev.forEach(l => {
        if (!curr.find(c => c.key === l.key))
          sendSystemMessage(`­čĹĄ ${l.nickname} opu┼Ťci┼é sesj─Ö`)
      })
    }
    prevListenersRef.current = curr
  }, [sessionListeners]) // eslint-disable-line react-hooks/exhaustive-deps

  // Widoczno┼Ť─ç wiadomo┼Ťci systemowych (localStorage)
  const [showSystemMsgs, setShowSystemMsgs] = useState(
    () => localStorage.getItem('chat-show-sys') !== 'false'
  )

  // Chat ÔÇö tick co sekund─Ö gdy kto┼Ť jest wyciszony (countdown)
  const [chatTick, setChatTick] = useState(0)
  useEffect(() => {
    const hasTimed = Object.values(chatMuted).some(m => !m.blocked && m.until && m.until > Date.now())
    if (!hasTimed) return
    const id = setInterval(() => setChatTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [chatMuted])

  // Chat ÔÇö auto-scroll i licznik nieprzeczytanych (ref zapobiega fa┼észywemu resetowi)
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

  // Zak┼éadka Podobne ÔÇö ┼éaduj rekomendacje lokalnie
  // Od┼Ťwie┼╝a si─Ö tylko przy: klikni─Öciu zak┼éadki LUB gdy kolejka uro┼Ťnie o 3 (refreshSimilarTrigger)
  useEffect(() => {
    if (libraryView !== 'similar') return
    let cancelled = false
    setSimilarLoading(true)
    async function load() {
      try {
        if (mode === 'player') {
          const queue = localQueueRef.current
          const track = currentTrack
          // Bazuj na kolejce je┼Ťli ma elementy, inaczej na aktualnym utworze
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

  // Poka┼╝ modal gdy sesja zako┼äczona z b┼é─Ödem
  useEffect(() => {
    if (togetherError) {
      soundSessionEnd()
      setSessionEndedMsg(togetherError)
    }
  }, [togetherError])

  // D┼║wi─Ök zmiany trybu
  const prevModeRef = useRef(null)
  useEffect(() => {
    if (prevModeRef.current === null) { prevModeRef.current = mode; return }
    if (mode === prevModeRef.current) return
    prevModeRef.current = mode
    if (mode === 'radio') soundSwitchRadio()
    else if (mode === 'player') soundSwitchPlayer()
  }, [mode])

  // D┼║wi─Ök do┼é─ůczenia/wyj┼Ťcia z sesji (tylko gdy w sesji)
  const prevListenerCountRef = useRef(null)
  useEffect(() => {
    if (!inSession) { prevListenerCountRef.current = null; return }
    if (prevListenerCountRef.current === null) { prevListenerCountRef.current = listenerCount; return }
    if (listenerCount > prevListenerCountRef.current) soundJoin()
    else if (listenerCount < prevListenerCountRef.current) soundLeave()
    prevListenerCountRef.current = listenerCount
  }, [listenerCount, inSession])

  // D┼║wi─Ök gdy dostaniemy nowe uprawnienie (go┼Ť─ç)
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

  // D┼║wi─Ök zatrzymania radia
  const prevRadioPlayingRef = useRef(null)
  useEffect(() => {
    if (prevRadioPlayingRef.current === null) { prevRadioPlayingRef.current = isRadioPlaying; return }
    if (prevRadioPlayingRef.current === true && isRadioPlaying === false) soundStop()
    prevRadioPlayingRef.current = isRadioPlaying
  }, [isRadioPlaying])

  // D┼║wi─Ök zatrzymania playera
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
    const noPerms = () => showSessionToast('Brak uprawnie┼ä do tej komendy.')
    const hostOnly = () => showSessionToast('Tylko host mo┼╝e u┼╝y─ç tej komendy.')
    const isMod = isHost || (myPermissions.canPlay && myPermissions.canSkip && myPermissions.canAdd)

    switch (cmd) {
      case '/clear':
        if (!isHost) return hostOnly()
        clearChat()
        sendSystemMessage(`­čŚĹ´ŞĆ ${myNickname} wyczyszci┼é czat`)
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
        if (!nick) return showSessionToast('U┼╝ycie: /mute [nick] [sekundy]')
        muteChatUser(nick, secs)
        sendSystemMessage(`­čöç ${nick} zosta┼é wyciszony na ${secs}s`)
        return
      }
      case '/unmute': {
        if (!isHost) return hostOnly()
        const nick = args[0]
        if (!nick) return showSessionToast('U┼╝ycie: /unmute [nick]')
        unblockChatUser(nick)
        sendSystemMessage(`­čöŐ ${nick} zosta┼é odciszony`)
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
        if (!target || !text) return showSessionToast('U┼╝ycie: /msg [nick] [wiadomo┼Ť─ç]')
        sendChatMessage(text, false, target)
        return
      }
      case '/r': {
        const text = args.join(' ')
        if (!text) return showSessionToast('U┼╝ycie: /r [wiadomo┼Ť─ç]')
        if (!lastPmSenderRef.current) return showSessionToast('Brak ostatniego PM do odpowiedzi.')
        sendChatMessage(text, false, lastPmSenderRef.current)
        return
      }
      case '/vol': {
        const v = parseInt(args[0])
        if (isNaN(v) || v < 0 || v > 100) return showSessionToast('U┼╝ycie: /vol [0-100]')
        setVolumePercent(v)
        showSessionToast(`­čöŐ G┼éo┼Ťno┼Ť─ç: ${v}%`)
        return
      }
      case '/queue':
        showSessionToast(`Kolejka: ${activeQueue.length} ${activeQueue.length === 1 ? 'utw├│r' : 'utwor├│w'}`)
        return
      case '/sys':
        setShowSystemMsgs(v => {
          const next = !v
          localStorage.setItem('chat-show-sys', String(next))
          showSessionToast(next ? 'Ôťů Wiadomo┼Ťci systemowe w┼é─ůczone' : '­čÜź Wiadomo┼Ťci systemowe wy┼é─ůczone')
          return next
        })
        return
      case '/help':
        showSessionToast('/clear /next /stop /pause /play /mute /unmute /me /msg /r /vol /queue /sys')
        return
      default:
        showSessionToast(`Nieznana komenda: ${cmd}. Wpisz /help po list─Ö.`)
    }
  }

  const devSnapshot = useMemo(() => {
    if (!devPanelOpen) return null
    return {
      mode,
      tvSubMode,
      libraryView,
      volumePercent,
      isTrackPlaying,
      isTrackReady,
      trackTime: Number(trackTime || 0).toFixed(1),
      trackDuration: Number(trackDuration || 0).toFixed(1),
      isRadioPlaying,
      isRadioBuffering,
      isSwitchingStationStream,
      currentTvChannel: currentTvChannel?.name || '',
      tvIsPlaying,
      tvPlayerError,
      tvExpandMode,
      tvChannelsCount: tvChannels.length,
      currentTrack: currentTrack?.title || '',
      currentStation: currentStation?.name || '',
      visibleTracksCount: visibleTracks.length,
      visibleStationsCount: filteredStations.length,
      queueLength: activeQueue.length,
      inSession,
      isHost,
      trackError,
      radioError,
    }
  }, [
    devPanelOpen,
    mode,
    tvSubMode,
    libraryView,
    volumePercent,
    isTrackPlaying,
    isTrackReady,
    trackTime,
    trackDuration,
    isRadioPlaying,
    isRadioBuffering,
    isSwitchingStationStream,
    currentTvChannel?.name,
    tvIsPlaying,
    tvPlayerError,
    tvExpandMode,
    tvChannels.length,
    currentTrack?.title,
    currentStation?.name,
    visibleTracks.length,
    filteredStations.length,
    activeQueue.length,
    inSession,
    isHost,
    trackError,
    radioError,
  ])

  return (
    <>
    <TvCastPanel
      isOpen={tvCastOpen}
      onClose={() => setTvCastOpen(false)}
      currentStation={currentStation}
      currentStreamUrl={currentRadioStreamUrl}
      radioNowPlaying={radioNowPlaying}
      tvActiveDevice={tvActiveDevice}
      mode={mode}
      currentTrack={currentTrack}
      isPlaying={mode === 'radio' ? isRadioPlaying : isTrackPlaying}
      onPlayPause={() => handlePlayPause()}
      onPrev={() => mode === 'radio' ? handleStationPrev() : handleTrackPrevious(isTrackPlaying)}
      onNext={() => mode === 'radio' ? handleStationNext() : handleTrackNext(true)}
      onCastSuccess={(device) => {
        tvActiveDeviceRef.current = device
        tvLastCastKeyRef.current  = `${currentRadioStreamUrl}|${currentStation?.id ?? ''}`
        setTvActiveDevice(device)
      }}
      onCastStop={() => {
        tvActiveDeviceRef.current = null
        tvLastCastKeyRef.current  = ''
        setTvActiveDevice(null)
      }}
    />
    {devPanelOpen && (
      <DevDiagnosticsOverlay
        snapshot={devSnapshot}
        getFps={() => fpsRef.current}
        onClose={() => setDevPanelOpen(false)}
      />
    )}
    {splashVisible && (
      <div className={`splash-screen${splashFading ? ' fading' : ''}`}>
        <div className="splash-inner">
          <h1 className="splash-title">Music App</h1>
          <p className="splash-sub">by MrPerru</p>
        </div>
      </div>
    )}
    <main className={`app-shell${mode === 'tv' && tvExpandMode !== 'normal' ? ' tv-yt-expanded' : ''}`}>
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

      {/* Single player */}
      {mode === 'player' && (
        <ReactPlayer
          key="main-player"
          ref={playerRef}
          src={trackStreamUrl || null}
          playing={isTrackPlaying && !!trackStreamUrl}
          controls={false}
          width="1px" height="1px"
          volume={effectiveVolume}
          muted={volumePercent === 0 || !!tvActiveDevice}
          playsInline
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
          config={{ youtube: { playerVars: { controls: 0, rel: 0, modestbranding: 1, playsinline: 1 } } }}
          onReady={() => {
            setIsTrackReady(true); setTrackError('')
            if (pendingRemoteSeekRef.current !== null) {
              const t = pendingRemoteSeekRef.current; pendingRemoteSeekRef.current = null
              trackTimeRef.current = t
              if (playerRef.current) playerRef.current.currentTime = t; setTrackTime(t)
              setDiscordTrackSyncNonce((value) => value + 1)
            }
          }}
          onProgress={({ loaded }) => {
            seekBufferRef.current?.style.setProperty('--buf', `${(loaded * 100).toFixed(2)}%`)
          }}
          onPlay={() => setIsTrackPlaying(true)}
          onPause={() => {/* YouTube odpala onPause przy bufferowaniu ÔÇö ignoruj */}}
          onDurationChange={(d) => setTrackDuration(Number(d) || 0)}
          onEnded={() => handleTrackNext(true)}
          onError={async () => {
            const originalUrl = String(currentTrack?.url || '').trim()
            if (isValidYoutubeUrl(originalUrl) && trackStreamUrl === originalUrl) {
              try {
                const resolved = await window.playerBridge?.getAudioUrl?.(originalUrl)
                if (resolved && String(resolved) !== originalUrl) {
                  setTrackStreamUrl(String(resolved))
                  setTrackError('')
                  return
                }
              } catch {}
            }
            if (isValidYoutubeUrl(originalUrl) && trackStreamUrl && trackStreamUrl !== originalUrl) {
              setTrackStreamUrl(originalUrl)
              setTrackError('')
              return
            }
            setIsTrackPlaying(false)
            const ok = await window.playerBridge?.youtubeCheckLogin?.()
            if (!ok) setTrackError('__yt_login__')
            else setTrackError('Ten utw├│r nie daje si─Ö odtworzy─ç (prywatny lub usuni─Öty). Wybierz inny.')
          }}
        />
      )}

      {/* T┼éo aplikacji ÔÇö orby reaguj─ůce na muzyk─Ö */}
      <canvas
        ref={bgCanvasRef}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: -1, pointerEvents: 'none' }}
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
            <button className={mode === 'tv' ? 'active' : ''} onClick={() => updateMode('tv')}>
              TV
            </button>
          </div>
        </div>

        <div className="topbar-main">
          <p className="eyebrow">Jeden player, dwa tryby,powered by MrPerru </p>
          <h1>{mode === 'radio' ? 'Radio' : mode === 'player' ? 'Player' : 'TV'}</h1>
        </div>

        <div className="topbar-metrics">
          <span>{favorites.length} ulubionych</span>
          <span>{mode === 'radio' ? 'Radio online' : mode === 'player' ? 'Audio z YouTube' : 'IPTV & YouTube'}</span>
          <button
            className={`together-btn${inSession ? ' active' : ''}`}
            onClick={() => setSessionModalOpen(v => !v)}
            title="S┼éuchaj razem"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
            {inSession && <span className="together-count">{listenerCount}</span>}
          </button>
          {mode === 'player' && (
            <button
              className={`together-btn${lyricsVisible ? ' active' : ''}`}
              onClick={() => setLyricsVisible(v => !v)}
              title="Tekst piosenki"
            >­čÄĄ</button>
          )}
          {inSession && (
            <button
              className={`together-btn game-btn${gameState === 'playing' ? ' active' : ''}`}
              onClick={() => gameState === 'playing' ? setMonopolyOpen(true) : setGameLobbyOpen(v => !v)}
              title="Monopoly"
            >­čÄ▓</button>
          )}
          {window.playerBridge && (
            <button
              className={`together-btn${tvActiveDevice ? ' casting' : tvCastOpen ? ' active' : ''}`}
              onClick={() => setTvCastOpen(v => !v)}
              title={tvActiveDevice ? `Na ┼╝ywo: ${tvActiveDevice.name}` : 'Otw├│rz Radio na TV'}
            >ß»Ą{tvActiveDevice && <span className="together-count casting-dot">ÔŚĆ</span>}</button>
          )}
        </div>
      </header>


      <section className="content-grid">
        <article className="stage-card">
          <div className="stage-header" style={{ display: mode === 'tv' ? 'none' : '' }}>
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
                    <p key={radioNowPlaying} className="stage-nowplaying"
                      title={radioNowPlaying ? 'Kliknij aby skopiowa─ç' : undefined}
                      style={radioNowPlaying ? { cursor: 'pointer' } : undefined}
                      onClick={() => {
                        if (!radioNowPlaying) return
                        navigator.clipboard?.writeText(radioNowPlaying)
                        showSessionToast('­čôő Skopiowano: ' + radioNowPlaying)
                      }}
                    >
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
                    <p className={`radio-track-prev${radioPlayHistory.length === 0 ? ' radio-track-prev--empty' : ''}`}
                      title={radioPlayHistory.length > 0 ? 'Kliknij aby skopiowa─ç' : undefined}
                      style={radioPlayHistory.length > 0 ? { cursor: 'pointer' } : undefined}
                      onClick={() => {
                        if (!radioPlayHistory[0]) return
                        navigator.clipboard?.writeText(radioPlayHistory[0])
                        showSessionToast('­čôő Skopiowano: ' + radioPlayHistory[0])
                      }}
                    >
                      <span className="radio-track-prev-label">Wcze┼Ťniej gra┼éo: </span>
                      {radioPlayHistory[0] || ''}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button className={isFavorite ? 'accent active' : 'accent'} onClick={toggleFavorite}>
              {isFavorite ? 'W ulubionych' : 'Dodaj do ulubionych'}
            </button>
          </div>

          {mode === 'tv' && (
            <div className="tv-stage">
              <div className="tv-submode-bar">
                <button className={`tv-submode-btn${tvSubMode === 'channels' ? ' active' : ''}`} onClick={() => setTvSubMode('channels')}>­čô║ Kana┼éy</button>
                <button className={`tv-submode-btn${tvSubMode === 'youtube' ? ' active' : ''}`} onClick={() => {
                  if (!checkPerm('canAdd')) return
                  setTvSubMode('youtube')
                  setCurrentTvChannel(null)
                  if (inSession) notifyAction('tvStateChange', { subMode: 'youtube', youtubeUrl: tvYoutubeUrl || '' })
                }}>ÔľÂ YouTube</button>
             
              </div>
              {tvSubMode === 'youtube' && (
                <div className="tv-yt-bar">
                  <input
                    className="tv-yt-input"
                    value={tvYoutubeInput}
                    onChange={e => { const v = e.target.value; setTvYoutubeInput(v); if (isValidYoutubeUrl(v.trim())) applyTvYoutubeUrl(v) }}
                    onKeyDown={e => { if (e.key === 'Enter' && isValidYoutubeUrl(tvYoutubeInput)) applyTvYoutubeUrl(tvYoutubeInput) }}
                    placeholder="Wklej link YouTube lub YouTube Live..."
                  />
                  <button
                    className="tv-yt-play-btn"
                    onClick={() => { if (isValidYoutubeUrl(tvYoutubeInput)) applyTvYoutubeUrl(tvYoutubeInput) }}
                  >ÔľÂ</button>
                </div>
              )}
              <div ref={tvPlayerWrapRef} className="tv-player-wrap">
                {tvSubMode === 'channels' && currentTvChannel && (() => {
                  const expanded = tvExpandMode !== 'normal'

                  const exitExpand = () => {
                    window.playerBridge?.setWindowFullscreen?.(false)
                    setTvExpandMode('normal')
                  }

                  const playerEl = (
                    <div style={expanded
                      ? { position: 'fixed', inset: 0, zIndex: 2147483646, background: '#000' }
                      : { position: 'relative', width: '100%', height: '100%' }
                    }>
                      <TvChannelPlayer
                        key={`${currentTvChannel.id + currentTvChannel.url}-${tvStreamNonce}`}
                        channel={currentTvChannel}
                        videoRef={tvVideoRef}
                        onError={onTvError}
                        onPlaying={onTvPlaying}
                        onPause={onTvPause}
                        onStall={onTvStall}
                        volume={toEffectiveVolume(volumePercent, 'log')}
                        expanded={expanded}
                      />
                    </div>
                  )

                  return (
                    <>
                      {expanded && <div className="tv-placeholder"><span className="tv-placeholder-icon">­čô║</span><span>{currentTvChannel.name}</span></div>}
                      {playerEl}
                      {expanded
                        ? createPortal(
                          <div style={{ position: 'fixed', inset: 0, zIndex: 2147483647, background: 'transparent' }} className="tv-fs-portal">
                            <button className="tv-fs-close" title="Zamknij (Esc)" onClick={exitExpand}>ÔťĽ</button>
                            <div className="tv-fs-bar">
                              <span className="tv-fs-channel">­čô║ {currentTvChannel.name}</span>
                              <div style={{ flex: 1 }} />
                              <div className="tv-fs-vol">
                                <button className="tv-fs-vol-icon" title="Wycisz/W┼é─ůcz"
                                  onClick={() => setVolumePercent(v => v === 0 ? 35 : 0)}>
                                  {volumePercent === 0
                                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-3-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 18l1.98 2L21 18.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                                    : volumePercent < 50
                                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>
                                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>}
                                </button>
                                <input className="tv-fs-vol-slider" type="range" min="0" max="100" step="1"
                                  value={volumePercent}
                                  onChange={handleVolumeChange}
                                  onMouseUp={handleVolumeCommit}
                                  onTouchEnd={handleVolumeCommit}
                                  style={{ '--vol': `${volumePercent}%` }}
                                />
                                <span className="tv-fs-vol-num">{volumePercent}%</span>
                              </div>
                              <button className="tv-fs-btn" title={tvExpandMode === 'app' ? 'Wyjd┼║ z monitora' : 'Pe┼ény ekran monitora'}
                                onClick={() => {
                                  if (tvExpandMode === 'app') {
                                    setTvExpandMode('monitor')
                                    window.playerBridge?.setWindowFullscreen?.(true)
                                  } else {
                                    setTvExpandMode('app')
                                    window.playerBridge?.setWindowFullscreen?.(false)
                                  }
                                }}>
                                {tvExpandMode === 'monitor'
                                  ? <><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg><span>Tryb aplikacji</span></>
                                  : <><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5v4h2V5h4V3H5C3.9 3 3 3.9 3 5zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/></svg><span>Pe┼ény monitor</span></>}
                              </button>
                              <button className="tv-fs-btn tv-fs-exit-btn" onClick={exitExpand}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                                <span>Zamknij</span>
                              </button>
                            </div>
                          </div>,
                          document.body
                        )
                        : (
                          <div className="tv-inline-controls">
                            <button className="tv-exp-btn" style={{ right: 56 }}
                              title="Pe┼éna aplikacja"
                              onClick={() => setTvExpandMode('app')}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                            </button>
                            <button className="tv-exp-btn" style={{ right: 12 }}
                              title="Pe┼ény ekran monitora"
                              onClick={() => { setTvExpandMode('monitor'); window.playerBridge?.setWindowFullscreen?.(true) }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5v4h2V5h4V3H5C3.9 3 3 3.9 3 5zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/></svg>
                            </button>
                          </div>
                        )}
                    </>
                  )
                })()}
                {tvSubMode === 'youtube' && tvYoutubeUrl && (() => {
                  const embedUrl = getYoutubeEmbedUrl(tvYoutubeUrl)
                  if (!embedUrl) return (
                    <div className="tv-error-overlay">
                      <span>ÔÜá Nie uda┼éo si─Ö odczyta─ç linku YouTube</span>
                      <button onClick={() => { setTvYoutubeUrl(''); setTvYoutubeInput('') }}>Wyczy┼Ť─ç</button>
                    </div>
                  )
                  const expanded = tvExpandMode !== 'normal'
                  const exitExpand = () => { window.playerBridge?.setWindowFullscreen?.(false); setTvExpandMode('normal') }

                  const injectCss = (attempt = 0) => {
                    try {
                      const doc = tvYtIframeRef.current?.contentDocument
                      if (!doc) { if (attempt < 30) setTimeout(() => injectCss(attempt + 1), 200); return }
                      if (doc.getElementById('app-yt-css')) return
                      const s = doc.createElement('style')
                      s.id = 'app-yt-css'
                      // controls=0 ukrywa chrome-bottom; te selektory usuwaj─ů reszt─Ö nak┼éadek
                      s.textContent = `
                        .ytp-title, .ytp-title-text, .ytp-title-link,
                        .ytp-watermark,
                        .ytp-endscreen, .videowall-endscreen, .ytp-ce-element,
                        .ytp-cards-teaser, .ytp-cards-teaser-text, .ytp-cards-button,
                        .ytp-sb-subscribe, .ytp-autonav-toggle-button,
                        .ytp-chrome-top, .ytp-gradient-top,
                        .ytp-share-button, .ytp-watch-later-button,
                        .ytp-copy-link-button, .ytp-miniplayer-button
                        { display: none !important; }
                      `
                      doc.head?.appendChild(s)
                    } catch { if (attempt < 30) setTimeout(() => injectCss(attempt + 1), 200) }
                  }

                  const handleCc = () => {
                    try {
                      tvYtIframeRef.current?.contentDocument?.querySelector('.ytp-subtitles-button')?.click()
                    } catch {}
                    setTvYtCc(p => !p)
                  }

                  // iframe ZAWSZE w tym samym miejscu DOM ÔÇö tylko styl si─Ö zmienia
                  // Dzi─Öki temu React nie odmontowuje przy expand i video nie restartuje
                  return (
                    <>
                      <iframe
                        key={embedUrl}
                        ref={tvYtIframeRef}
                        src={embedUrl}
                        style={expanded
                          ? { position: 'fixed', inset: 0, zIndex: 2147483646, border: 'none', display: 'block', width: '100%', height: '100%' }
                          : { border: 'none', display: 'block', width: '100%', height: '100%' }
                        }
                        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                        allowFullScreen
                        title="YouTube"
                        onLoad={() => {
                          tvYtIframeRef.current?.contentWindow?.postMessage(
                            JSON.stringify({ event: 'listening', id: 1 }),
                            'https://www.youtube-nocookie.com'
                          )
                          injectCss()
                        }}
                      />

                      {/* Tryb normalny ÔÇö CC u g├│ry + expand u do┼éu */}
                      {!expanded && (
                        <>
                          <button
                            className={`tv-exp-btn tv-yt-cc-btn${tvYtCc ? ' active' : ''}`}
                            style={{ top: 14, right: 14, bottom: 'auto' }}
                            title={tvYtCc ? 'Wy┼é─ůcz napisy' : 'W┼é─ůcz napisy'}
                            onClick={handleCc}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-9 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/></svg>
                            <span style={{ fontSize: '0.65rem', lineHeight: 1 }}>CC</span>
                          </button>
                          <div className="tv-inline-controls">
                            <button className="tv-exp-btn" style={{ right: 56 }}
                              title="Pe┼éna aplikacja"
                              onClick={() => setTvExpandMode('app')}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                            </button>
                            <button className="tv-exp-btn" style={{ right: 12 }}
                              title="Pe┼ény ekran monitora"
                              onClick={() => { setTvExpandMode('monitor'); window.playerBridge?.setWindowFullscreen?.(true) }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5v4h2V5h4V3H5C3.9 3 3 3.9 3 5zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/></svg>
                            </button>
                          </div>
                        </>
                      )}

                      {/* Tryb rozszerzony ÔÇö tylko kontrolki w portalu, iframe jest fixed powy┼╝ej */}
                      {expanded && createPortal(
                        <div style={{ position: 'fixed', inset: 0, zIndex: 2147483647, background: 'transparent', pointerEvents: 'none' }} className="tv-fs-portal">
                          <button className="tv-fs-close" style={{ pointerEvents: 'auto' }} title="Zamknij (Esc)" onClick={exitExpand}>ÔťĽ</button>
                          <div className="tv-fs-bar" style={{ pointerEvents: 'auto' }}>
                            <span className="tv-fs-channel">ÔľÂ {tvYtTitle || 'YouTube'}</span>
                            <div style={{ flex: 1 }} />
                            {/* CC w pasku fullscreen */}
                            <button
                              className={`tv-fs-btn${tvYtCc ? ' active' : ''}`}
                              style={tvYtCc ? { background: 'rgba(91,141,240,0.25)', borderColor: 'rgba(91,141,240,0.6)', color: '#8eb4ff' } : undefined}
                              onClick={handleCc}
                              title={tvYtCc ? 'Wy┼é─ůcz napisy' : 'W┼é─ůcz napisy'}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-9 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/></svg>
                              <span>CC</span>
                            </button>
                            <div className="tv-fs-vol">
                              <button className="tv-fs-vol-icon" title="Wycisz/W┼é─ůcz" onClick={() => setVolumePercent(v => v === 0 ? 35 : 0)}>
                                {volumePercent === 0
                                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-3-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 18l1.98 2L21 18.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                                  : volumePercent < 50
                                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>
                                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>}
                              </button>
                              <input className="tv-fs-vol-slider" type="range" min="0" max="100" step="1"
                                value={volumePercent} onChange={handleVolumeChange}
                                onMouseUp={handleVolumeCommit} onTouchEnd={handleVolumeCommit}
                                style={{ '--vol': `${volumePercent}%` }}
                              />
                              <span className="tv-fs-vol-num">{volumePercent}%</span>
                            </div>
                            <button className="tv-fs-btn" title={tvExpandMode === 'app' ? 'Pe┼ény monitor' : 'Tryb aplikacji'}
                              onClick={() => {
                                if (tvExpandMode === 'app') { setTvExpandMode('monitor'); window.playerBridge?.setWindowFullscreen?.(true) }
                                else { setTvExpandMode('app'); window.playerBridge?.setWindowFullscreen?.(false) }
                              }}>
                              {tvExpandMode === 'monitor'
                                ? <><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg><span>Tryb aplikacji</span></>
                                : <><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5v4h2V5h4V3H5C3.9 3 3 3.9 3 5zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/></svg><span>Pe┼ény monitor</span></>}
                            </button>
                            <button className="tv-fs-btn tv-fs-exit-btn" onClick={exitExpand}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                              <span>Zamknij</span>
                            </button>
                          </div>
                        </div>,
                        document.body
                      )}
                    </>
                  )
                })()}
                {((tvSubMode === 'channels' && !currentTvChannel) || (tvSubMode === 'youtube' && !tvYoutubeUrl)) && (
                  <div className="tv-placeholder">
                    {tvSubMode === 'channels' ? (
                      <>
                        <span className="tv-placeholder-icon">
                          <svg width="52" height="52" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>
                        </span>
                        <span className="tv-placeholder-title">Wybierz kana┼é z listy po prawej</span>
                        <span className="tv-placeholder-sub">Kliknij na kana┼é aby rozpocz─ů─ç odtwarzanie</span>
                      </>
                    ) : (
                      <>
                        <span className="tv-placeholder-icon">
                          <svg width="52" height="52" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
                        </span>
                        <span className="tv-placeholder-title">Wklej link YouTube</span>
                        <span className="tv-placeholder-sub">Link zostanie odtworzony automatycznie po wklejeniu</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="info-strip info-strip-tv">
                <span>{tvSubMode === 'youtube' ? 'YouTube TV' : 'Kana┼éy TV'}</span>
                <span>
                  {tvSubMode === 'youtube'
                    ? (tvYtTitle || (tvYoutubeUrl ? '┼üadowanie danych filmu...' : 'Wklej link YouTube'))
                    : (currentTvChannel?.name || 'Wybierz kana┼é')}
                </span>
                <span className="info-strip-dot">
                  {tvSubMode === 'youtube'
                    ? (tvYtPlaying ? 'ÔŚĆ Na ┼╝ywo' : 'ÔŚő Stop')
                    : (tvIsPlaying ? 'ÔŚĆ Na ┼╝ywo' : 'ÔŚő Stop')}
                </span>
                <span className="info-strip-online"><i className="online-dot" />{onlineCount} online</span>
              </div>
            </div>
          )}

          <ElectricBorder
            colorBase="#a5a5a5b9"
            colorPeak="#ff6600"
            speed={(mode === 'radio' ? isRadioPlaying : isTrackPlaying) ? 0.15 : 0.08}
            speedMax={(mode === 'radio' ? isRadioPlaying : isTrackPlaying) ? 2.5 : 0.04}
            chaos={0.055}
            chaosMax={0.075}
            energyRef={electricEnergyRef}
            borderRadius={20}
            style={{ flex: 1, minHeight: 0, marginTop: 10, display: mode === 'tv' ? 'none' : undefined }}
          >
          <div className={`stage-visual ${mode}`} style={{ marginTop: 0 }}>
            <canvas ref={vizBgCanvasRef} className="viz-bg-canvas" />
            <div className="stage-clock">
              <div className="stage-clock-left">
                <span ref={clockHmRef} className="stage-clock-hm" />
                <span ref={clockSRef}  className="stage-clock-s"  />
              </div>
              <span className="stage-clock-sep" />
              <span ref={clockDateRef} className="stage-clock-date" />
              {weather && (
                <>
                  <span className="stage-clock-sep" />
                  <span className="stage-clock-now">
                    <span className="weather-icon">{weatherIcon(weather.code)}</span>
                    <span className="weather-temp">{weather.temp}┬░C</span>
                    <span className="weather-city">Warszawa</span>
                  </span>
                  <span className="stage-clock-sep" />
                  <div className="stage-clock-forecast">
                    {weather.forecast.map((day) => (
                      <span key={day.date} className="forecast-day">
                        <span className="forecast-dow">
                          {new Date(day.date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short' })}
                        </span>
                        <span className="forecast-icon">{weatherIcon(day.code)}</span>
                        <span className="forecast-temps">
                          <span className="forecast-max">{day.max}┬░</span>
                          <span className="forecast-min">{day.min}┬░</span>
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="radio-stage-body">
                <div ref={audioMotionContainerRef} className="audio-motion-viz" />
                {tvActiveDevice && mode === 'player' && (
                  <div className="cast-streaming-overlay">
                    <span className="cast-streaming-dot" />
                    Streaming Ôćĺ {tvActiveDevice.name}
                  </div>
                )}
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
                          Radio <span className="radio-viz-hint-station">{fallbackStationName}</span> nie dzia┼éa
                        </span>
                        <span className="radio-viz-hint-line secondary">Odpalamy stacj─Ö podstawow─ů</span>
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
                    if (playerRef.current) playerRef.current.currentTime = t
                  }}
                />
              </div>
            </div>
          </ElectricBorder>

          <div className="info-strip" style={{ display: mode === 'tv' ? 'none' : '' }}>
            {mode === 'radio' ? (
              <>
                <span>{countryFlagEmoji(currentStation?.countryCode)} {currentStation?.country || 'Online'}</span>
                <span>{(currentStation?.codec || 'STREAM').toUpperCase()} ┬Ě {currentStation?.bitrate ? `${currentStation.bitrate} kbps` : 'Auto'}</span>
                {currentStation?.language ? <span>{currentStation.language}</span> : null}
                {currentStation?.votes > 0 ? <span>ÔÖą {currentStation.votes > 999 ? `${(currentStation.votes / 1000).toFixed(1)}k` : currentStation.votes}</span> : null}
                {currentStation?.tags ? <span>{currentStation.tags.split(',')[0].trim()}</span> : null}
                <span className="info-strip-dot">{isRadioVisualLoading ? 'ÔŚő Buforuje' : isRadioPlaying ? 'ÔŚĆ Na ┼╝ywo' : 'ÔŚő Stop'}</span>
                <span className="info-strip-online"><i className="online-dot" />{onlineCount} online</span>
              </>
            ) : (
              <>
                {currentTrack && isTrackReady && trackDuration > 0 ? (
                  <span className="info-strip-remaining">Ôłĺ{formatSeconds(Math.max(0, trackDuration - trackTime))}</span>
                ) : (
                  <span className="info-strip-remaining">{currentTrack?.duration || 'ÔÇö'}</span>
                )}
                {currentTrack ? (
                  <span>#{visibleTracks.findIndex((t) => t.id === currentTrack.id) + 1} / {visibleTracks.length}</span>
                ) : null}
                <span>{currentTrack?.author || 'YouTube'}</span>
                {isFavorite ? <span>Ôśů Ulubiona</span> : null}
                <span className="info-strip-dot">{isTrackReady ? 'ÔŚĆ Gotowy' : 'ÔŚő ┼üadowanie'}</span>
                <span className="info-strip-online"><i className="online-dot" />{onlineCount} online</span>
              </>
            )}
          </div>
        </article>

        <aside className="library-card">
          <div className="library-toolbar" style={{ display: mode === 'tv' ? 'none' : '' }}>
            <div className="segmented-control small">
              <button className={libraryView === 'all' ? 'active' : ''} onClick={() => setLibraryView('all')}>
                Wszystkie
              </button>
              <button className={libraryView === 'favorites' ? 'active' : ''} onClick={() => setLibraryView('favorites')}>
                ÔÖą Ulubione
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
              {mode === 'player' && (
                <button
                  className={`${libraryView === 'myyt' ? 'active' : ''} myyt-tab`}
                  onClick={() => {
                    setLibraryView('myyt')
                    if (ytLoggedIn && myPlaylists.length === 0) loadMyPlaylists()
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
                  YT
                </button>
              )}
              {inSession && (
                <button className={`${libraryView === 'chat' ? 'active' : ''} chat-tab`} onClick={() => setLibraryView('chat')}>
                  Chat
                  {chatUnread > 0 && <span className="chat-unread-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>}
                </button>
              )}
            </div>

          </div>

          <div className={`library-extras${(libraryView === 'chat' || libraryView === 'similar') ? ' library-extras--hidden' : ''}`} style={{ display: mode === 'tv' ? 'none' : '' }}>
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
                  <span className="filters-chevron">{filtersOpen ? 'Ôľ▓' : 'Ôľ╝'}</span>
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
                      <p className="filters-label">J─Özyk</p>
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
                      <p className="filters-label">Typ materia┼éu</p>
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
                        <p className="filters-label">D┼éugo┼Ť─ç</p>
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
                <label htmlFor="search">Szukaj pojedynczych utwor├│w</label>
                <div className="search-row" style={{ position: 'relative' }}>
                  <input
                    id="search"
                    value={searchTerm}
                    onChange={(event) => { setSearchTerm(event.target.value); setShowSuggestions(true) }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="np. Pezet Dom nad wod─ů, Quebonafide, J Cole"
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
                          <img
                            className="suggestion-art"
                            src={safeArt(s.thumbnail, s.title, 'track')}
                            alt=""
                            onError={(e) => withFallbackArt(e, s.title, 'track')}
                          />
                          <div className="suggestion-copy">
                            <span className="suggestion-title">{s.title}</span>
                            <span className="suggestion-author">{s.author}</span>
                          </div>
                          {s.duration && <span className="suggestion-duration">{s.duration}</span>}
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

          <div className="library-header" style={{ display: mode === 'tv' ? 'none' : '' }}>
            <div>
              <p className="stage-label">Lista ┼║r├│de┼é</p>
              <h3>
                {mode === 'radio' ? 'Stacje' : 'Utwory'}
                <span className="count-pill count-pill--sm">
                  {libraryView === 'similar'
                    ? similarItems.length
                    : mode === 'radio'
                      ? (radioGardenMode ? rgResults.length : filteredStations.length)
                      : libraryView === 'suggested'
                        ? activeQueue.length
                        : libraryView === 'chat'
                          ? chatMessages.length
                          : visibleTracks.length}
                </span>
              </h3>
            </div>
            {mode === 'radio' ? (
              <div className="station-search">
                <input
                  type="text"
                  value={stationSearchTerm}
                  onChange={(event) => setStationSearchTerm(event.target.value)}
                  placeholder={radioGardenMode ? '­čîŹ Szukaj stacji...' : 'Szukaj stacji...'}
                />
                <button
                  className={`rg-toggle-btn${radioGardenMode ? ' active' : ''}`}
                  onClick={() => { setRadioGardenMode(v => !v); setRgResults([]); setStationSearchTerm('') }}
                  title="Radio Garden ÔÇö stacje z ca┼éego ┼Ťwiata"
                >­čîŹ</button>
                {radioGardenMode && (
                  <select className="rg-country-inline" value={rgCountry} onChange={e => setRgCountry(e.target.value)}>
                    <option value="">­čîŹ Wszystkie</option>
                    <option value="PL">­čçÁ­čç▒ PL</option>
                    <option value="US">­čç║­čçŞ US</option>
                    <option value="GB">­čçČ­čçž GB</option>
                    <option value="DE">­čçę­čç¬ DE</option>
                    <option value="FR">­čçź­čçĚ FR</option>
                    <option value="ES">­čç¬­čçŞ ES</option>
                    <option value="IT">­čç«­čç╣ IT</option>
                    <option value="BR">­čçž­čçĚ BR</option>
                    <option value="JP">­čç»­čçÁ JP</option>
                    <option value="TR">­čç╣­čçĚ TR</option>
                    <option value="RU">­čçĚ­čç║ RU</option>
                    <option value="UA">­čç║­čçŽ UA</option>
                    <option value="SE">­čçŞ­čç¬ SE</option>
                    <option value="NL">­čç│­čç▒ NL</option>
                    <option value="AU">­čçŽ­čç║ AU</option>
                  </select>
                )}
              </div>
            ) : null}
          </div>

          {trackError && mode === 'player' ? (
            trackError === '__yt_login__' ? (
              <p className="status-copy error" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                Utw├│r 18+ wymaga zalogowania do YouTube.
                <button
                  style={{ fontSize: 12, padding: '2px 10px', borderRadius: 8, border: '1px solid #ffb05c', background: 'rgba(255,176,92,0.15)', color: '#ffb05c', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onClick={async () => {
                    await window.playerBridge?.youtubeLogin?.()
                    setTrackError('')
                    // Wymu┼Ť prze┼éadowanie playera przez zmian─Ö klucza
                    if (currentTrack) {
                      const saved = currentTrack
                      setCurrentTrack(null)
                      setTimeout(() => setCurrentTrack(saved), 300)
                    }
                  }}
                >Zaloguj do YouTube</button>
              </p>
            ) : (
              <p className="status-copy error">{trackError}</p>
            )
          ) : null}
          </div>

          {mode === 'tv' && (
            <div className="tv-library-top">
              {/* Filtry ÔÇö jak radio-filters */}
              <div className="radio-filters">
                <div className="country-filter">
                  <label>Kategoria</label>
                  <div className="radio-genre-chips" style={{ flexWrap: 'wrap' }}>
                    {TV_CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        className={`filter-chip${tvCategoryId === cat.id ? ' active' : ''}`}
                        onClick={() => { setTvCategoryId(cat.id); setTvSubMode('channels'); setTvChannelSearch(''); setTvChannelPage(0); setTvCountryFilter('') }}
                      >{cat.label}</button>
                    ))}
                  </div>
                </div>
                <div className="country-filter">
                  <label>Kraj kana┼éu</label>
                  <div className="tv-country-picker" ref={tvCountryPickerRef}>
                    <button
                      type="button"
                      className={`tv-country-picker-btn${tvCountryPickerOpen ? ' open' : ''}`}
                      onClick={() => {
                        setTvCountryPickerOpen((v) => {
                          const next = !v
                          if (next) setTvCountrySearch('')
                          return next
                        })
                      }}
                    >
                      {tvCountryFilter
                        ? <img src={getCountryFlagImageUrl(tvCountryFilter)} alt="" className="tv-country-flag" loading="lazy" />
                        : <span className="tv-country-globe">­čîÉ</span>}
                      <span>{tvCountryFilter ? formatCountryCodeLabel(tvCountryFilter) : 'Wszystkie kraje'}</span>
                      <span className="tv-country-caret">Ôľż</span>
                    </button>
                    {tvCountryPickerOpen && (
                      <div className="tv-country-picker-menu">
                        <div className="tv-country-picker-search-wrap">
                          <input
                            className="tv-country-picker-search"
                            type="text"
                            value={tvCountrySearch}
                            onChange={(e) => setTvCountrySearch(e.target.value)}
                            placeholder="Szukaj kraju..."
                          />
                        </div>
                        <button
                          type="button"
                          className={`tv-country-picker-option${!tvCountryFilter ? ' active' : ''}`}
                          onClick={() => { setTvCountryFilter(''); setTvChannelPage(0); setTvCountryPickerOpen(false); setTvCountrySearch('') }}
                        >
                          <span className="tv-country-globe">­čîÉ</span>
                          <span>Wszystkie kraje</span>
                        </button>
                        {tvVisibleCountryOptions.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`tv-country-picker-option${tvCountryFilter === c ? ' active' : ''}`}
                            onClick={() => { setTvCountryFilter(c); setTvChannelPage(0); setTvCountryPickerOpen(false); setTvCountrySearch('') }}
                          >
                            <img src={getCountryFlagImageUrl(c)} alt="" className="tv-country-flag" loading="lazy" />
                            <span>{formatCountryCodeLabel(c)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Nag┼é├│wek listy ÔÇö jak library-header */}
              <div className="library-header">
                <div>
                  <p className="stage-label">Lista ┼║r├│de┼é</p>
                  <h3>Kana┼éy <span className="count-pill count-pill--sm">{tvChannels.length}</span></h3>
                </div>
                {tvSubMode === 'channels' && (
                  <div className="station-search">
                    <input
                      type="text"
                      value={tvChannelSearch}
                      onChange={e => { setTvChannelSearch(e.target.value); setTvChannelPage(0) }}
                      placeholder="Szukaj kana┼éu..."
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div
            ref={libraryListRef}
            className={`library-list${libraryView === 'chat' ? ' library-list--chat' : ''}`}
          >
            {mode === 'tv' && tvSubMode === 'channels' && (() => {
              if (tvLoading) return Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="library-item skeleton" style={{ animationDelay: `${i * 0.06}s`, opacity: 0, animation: `fadeIn 0.3s ease ${i * 0.06}s forwards` }}>
                  <div className="skeleton-art" /><div className="skeleton-copy"><div className="skeleton-line wide" /><div className="skeleton-line narrow" /></div>
                </div>
              ))
              const q = tvChannelSearch.trim().toLowerCase()
              const filtered = tvChannels.filter(ch => {
                const channelCountries = getTvChannelCountryCodes(ch)
                if (tvCountryFilter && !channelCountries.includes(tvCountryFilter)) return false
                const countriesText = channelCountries.join(' ').toLowerCase()
                if (q && !ch.name.toLowerCase().includes(q) && !countriesText.includes(q)) return false
                return true
              })
              if (filtered.length === 0) return <div className="empty-state">{tvChannels.length === 0 ? 'Brak kana┼é├│w w tej kategorii.' : 'Brak wynik├│w dla wyszukiwanej frazy.'}</div>
              const paginated = filtered.slice(tvChannelPage * TV_PAGE_SIZE, (tvChannelPage + 1) * TV_PAGE_SIZE)
              return <>
                {paginated.map(ch => {
                  const selected = currentTvChannel?.id === ch.id
                  return (
                    <div key={ch.id} className={`library-item${selected ? ' active' : ''}`} onClick={() => {
                            setTvPlayerError(false)
                          if (currentTvChannel?.id === ch.id) setTvStreamNonce(n => n + 1)
                            setCurrentTvChannel(ch)
                          }} style={{ cursor: 'pointer' }}>
                      <div className="item-art with-badge">
                        {ch.logo
                          ? <img src={safeArt(sanitizeTvLogoUrl(ch.logo), ch.name, 'radio')} alt="" onError={e => withFallbackArt(e, ch.name, 'radio')} />
                          : <span style={{ fontSize: '1.4rem' }}>­čô║</span>}
                        {ch.country && <span className="item-flag">{countryFlagEmoji(ch.country)}</span>}
                      </div>
                      <div className="item-copy">
                        <span className="item-title">{ch.name}</span>
                        <span className="item-meta">{ch.country || 'TV'}{selected ? ' ┬Ě ÔŚĆ Live' : ''}</span>
                      </div>
                    </div>
                  )
                })}
                {filtered.length > TV_PAGE_SIZE && (
                  <div className="track-pagination">
                    <button className="load-more-btn" disabled={tvChannelPage === 0} onClick={() => { setTvChannelPage(p => p - 1); libraryListRef.current && (libraryListRef.current.scrollTop = 0) }}>ÔćÉ Poprzednie</button>
                    <span>{tvChannelPage * TV_PAGE_SIZE + 1}ÔÇô{Math.min((tvChannelPage + 1) * TV_PAGE_SIZE, filtered.length)} / {filtered.length}</span>
                    <button className="load-more-btn" disabled={(tvChannelPage + 1) * TV_PAGE_SIZE >= filtered.length} onClick={() => { setTvChannelPage(p => p + 1); libraryListRef.current && (libraryListRef.current.scrollTop = 0) }}>Nast─Öpne Ôćĺ</button>
                  </div>
                )}
              </>
            })()}
            {mode === 'tv' && tvSubMode === 'youtube' && (
              <div className="tv-yt-hint empty-state">
                <span>ÔľÂ Wklej link YouTube po lewej i ogl─ůdaj razem</span>
              </div>
            )}
            {mode === 'radio' && radioGardenMode && (
              rgLoading
                ? Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="library-item skeleton" style={{ animationDelay: `${i * 0.06}s`, opacity: 0, animation: `fadeIn 0.3s ease ${i * 0.06}s forwards` }}>
                      <div className="skeleton-art" /><div className="skeleton-copy"><div className="skeleton-line wide" /><div className="skeleton-line narrow" /></div>
                    </div>
                  ))
                : rgResults.length === 0
                  ? <div className="empty-state">{stationSearchTerm ? 'Brak wynik├│w' : 'Wpisz nazw─Ö stacji lub miasta...'}</div>
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
                            <span className="item-meta">{s.country}{s.tags ? ` ┬Ě ${s.tags.split(',').slice(0,2).join(', ')}` : ''}</span>
                          </div>
                        </div>
                      )
                    })
            )}

            {mode !== 'tv' && libraryView !== 'chat' && libraryView !== 'similar' && !(mode === 'radio' && radioGardenMode) && (mode === 'radio' ? radioLoading : trackLoading) && (mode === 'radio' ? filteredStations : visibleTracks).length === 0
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
                  {mode === 'player' && !currentTrack ? 'W┼é─ůcz jaki┼Ť utw├│r, ┼╝eby zobaczy─ç podobne.' : mode === 'radio' && !currentStation ? 'W┼é─ůcz stacj─Ö, ┼╝eby zobaczy─ç podobne.' : 'Brak podobnych wynik├│w.'}
                </div>
              ) : similarItems.map((item) => {
                const selected = (mode === 'player' ? currentTrack?.id : currentStation?.id) === item.id
                const flag = mode === 'radio' ? countryFlagEmoji(item.countryCode) : 'YT'
                const art = mode === 'radio'
                  ? safeArt(item.favicon, item.name, 'radio')
                  : safeArt(item.thumbnail, item.title, 'track')
                return (
                  <LibraryItem
                    key={item.id}
                    item={item}
                    selected={selected}
                    mode={mode}
                    activeTrackRef={activeTrackRef}
                    art={art}
                    flag={flag}
                    canSuggest={mode === 'player'}
                    isSuggested={suggestedIds.has(item.id)}
                    onSelect={handleItemSelect}
                    onSuggest={handleItemSuggest}
                  />
                )
              })
            ) : libraryView === 'suggested' && mode === 'player' ? (
              activeQueue.length === 0 ? (
                <div className="empty-state">Kolejka jest pusta ÔÇö dodaj utwory przyciskiem + przy ka┼╝dym utworze.</div>
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
                      title="Odtw├│rz teraz"
                      onClick={() => { selectTrack(item); removeFromQueue(item.key) }}
                    >ÔľÂ</button>
                    <button
                      className="suggestion-remove-btn"
                      title="Usu┼ä z kolejki"
                      onClick={() => removeFromQueue(item.key)}
                    >ÔťĽ</button>
                  </div>
                </div>
              ))
            ) : libraryView === 'myyt' && mode === 'player' ? (
              <div className="myyt-panel">
                {!ytLoggedIn ? (
                  <div className="myyt-login-prompt">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,176,92,0.6)"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
                    <p>Zaloguj si─Ö do YouTube, aby zobaczy─ç swoje playlisty i odtwarza─ç tre┼Ťci 18+</p>
                    <button className="myyt-login-btn" onClick={async () => {
                      await window.playerBridge?.youtubeLogin?.()
                      const ok = await window.playerBridge?.youtubeCheckLogin?.()
                      setYtLoggedIn(!!ok)
                      if (ok) loadMyPlaylists()
                    }}>
                      Zaloguj przez Google
                    </button>
                  </div>
                ) : myPlaylistsLoading ? (
                  <div className="myyt-loading">
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className="library-item skeleton" style={{ animationDelay: `${i * 0.06}s` }}>
                        <div className="skeleton-art" />
                        <div className="skeleton-copy">
                          <div className="skeleton-line wide" />
                          <div className="skeleton-line narrow" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : myPlaylists.length === 0 ? (
                  <div className="myyt-empty">
                    <p>Brak playlist na tym koncie.</p>
                    <button className="myyt-refresh-btn" onClick={loadMyPlaylists}>Od┼Ťwie┼╝</button>
                    <button className="myyt-logout-btn" onClick={async () => {
                      await window.playerBridge?.youtubeLogout?.()
                      setYtLoggedIn(false)
                      setMyPlaylists([])
                    }}>Wyloguj</button>
                  </div>
                ) : (
                  <>
                    <div className="myyt-header">
                      <span className="myyt-count">{myPlaylists.length} playlist</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="myyt-refresh-btn" onClick={loadMyPlaylists} title="Od┼Ťwie┼╝">Ôć╗</button>
                        <button className="myyt-logout-btn" onClick={async () => {
                          await window.playerBridge?.youtubeLogout?.()
                          setYtLoggedIn(false)
                          setMyPlaylists([])
                          setLibraryView('all')
                        }}>Wyloguj</button>
                      </div>
                    </div>
                    {myPlaylists.map(pl => (
                      <div key={pl.id} className={`library-item myyt-playlist-item${loadingPlaylistId === pl.id ? ' myyt-playlist-loading' : ''}`} onClick={async () => {
                        if (loadingPlaylistId) return
                        setLoadingPlaylistId(pl.id)
                        setTrackError('')
                        try {
                          const result = await window.playerBridge?.getPlaylistInnertube?.(pl.id)
                          const tracks = Array.isArray(result) ? result : (result?.tracks ?? [])
                          if (tracks.length > 0) {
                            startTransition(() => setSearchResults(tracks))
                            setActiveTrackQuery(`${pl.title} (${tracks.length} utwor├│w)`)
                            setLibraryView('all')
                            selectTrack(tracks[0], true, false)
                          } else {
                            setTrackError('Nie uda┼éo si─Ö za┼éadowa─ç playlisty.')
                          }
                        } catch (e) {
                          console.log('[myyt click] error:', e)
                          setTrackError('B┼é─ůd podczas ┼éadowania playlisty.')
                        } finally {
                          setLoadingPlaylistId(null)
                        }
                      }} style={{ cursor: 'pointer' }}>
                        <div className="item-art">
                          <img src={pl.thumbnail} alt="" onError={e => { e.target.style.display='none' }} />
                        </div>
                        <div className="item-copy">
                          <strong>{pl.title}</strong>
                          <span>{pl.countText}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : libraryView === 'chat' ? (
              <div className="chat-panel">
                <div className="chat-messages">
                  {chatMessages.length === 0 && (
                    <div className="empty-state">Brak wiadomo┼Ťci ÔÇö napisz co┼Ť!</div>
                  )}
                  {chatMessages.map((msg) => {
                    if (msg.system && !showSystemMsgs) return null
                    const time = new Date(msg.sentAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })

                    // Wiadomo┼Ť─ç systemowa
                    if (msg.system) {
                      return (
                        <div key={msg.key} className="chat-msg-system">
                          <span className="chat-msg-system-text">{msg.text}</span>
                          <span className="chat-msg-time">{time}</span>
                        </div>
                      )
                    }

                    // Prywatna wiadomo┼Ť─ç ÔÇö widoczna tylko dla nadawcy, odbiorcy i hosta
                    if (msg.pmTo) {
                      const pmVisible = isHost || msg.nick === myNickname || msg.pmTo === myNickname
                      if (!pmVisible) return null
                      if (msg.pmTo === myNickname && msg.nick !== myNickname) lastPmSenderRef.current = msg.nick
                      const pmIsMe = msg.nick === myNickname
                      return (
                        <div key={msg.key} className={`chat-msg-pm${pmIsMe ? ' chat-msg-pm-out' : ''}`}>
                          <div className="chat-msg-header">
                            <span className="chat-pm-label">{pmIsMe ? `PM Ôćĺ ${msg.pmTo}` : `PM ÔćÉ ${msg.nick}`}</span>
                            <span className="chat-msg-time">{time}</span>
                          </div>
                          <span className="chat-msg-text">{renderChatText(msg.text)}</span>
                        </div>
                      )
                    }

                    // Wiadomo┼Ť─ç /me (akcja)
                    if (msg.me) {
                      return (
                        <div key={msg.key} className="chat-msg-action">
                          <span className="chat-action-text">* {msg.nick} {msg.text}</span>
                          <span className="chat-msg-time">{time}</span>
                        </div>
                      )
                    }

                    // Zwyk┼éa wiadomo┼Ť─ç
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
                              {muteEntry.blocked ? '­čÜź' : `ÔĆ▒${muteSecsLeft}s`}
                            </span>
                          )}
                          <span className="chat-msg-time">{time}</span>
                        </div>
                        <span className="chat-msg-text">
                          {msg.deleted ? <em className="chat-deleted-text">Usuni─Öte przez hosta</em> : renderChatText(msg.text)}
                        </span>
                        {isHost && !isMe && !msg.deleted && (
                          <div className="chat-mod-actions">
                            <button className="chat-mod-btn chat-mod-delete" title="Usu┼ä wiadomo┼Ť─ç" onClick={() => deleteChatMsg(msg.key)}>ÔťĽ</button>
                            {isMuted ? (
                              <button className="chat-mod-btn chat-mod-unmute" title="Odblokuj" onClick={() => unblockChatUser(msg.nick)}>­čöŐ Odblokuj</button>
                            ) : (
                              <>
                                <button className="chat-mod-btn" title="Wycisz 10s" onClick={() => muteChatUser(msg.nick, 10)}>ÔĆ▒ 10s</button>
                                <button className="chat-mod-btn" title="Wycisz 30s" onClick={() => muteChatUser(msg.nick, 30)}>ÔĆ▒ 30s</button>
                                <button className="chat-mod-btn chat-mod-block" title="Zablokuj ca┼ékowicie" onClick={() => blockChatUser(msg.nick)}>­čÜź Blokuj</button>
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
                  if (blocked) return <div className="chat-muted-info">­čÜź Zosta┼ée┼Ť zablokowany przez hosta.</div>
                  if (timedOut) return <div className="chat-muted-info">ÔĆ▒ Wyciszony przez hosta ÔÇö jeszcze {secsLeft}s.</div>
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
                                  <span className="cmd-nick-icon">­čĹĄ</span>
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
                          placeholder="Wiadomo┼Ť─ç lub /komenda..."
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
                            // Nawigacja po li┼Ťcie komend
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
                            // Tab dla uzupe┼éniania nicku (/mute, /unmute)
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
                            // Wy┼Ťlij
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
                        >{chatInput.startsWith('/') ? 'Wykonaj' : 'Wy┼Ťlij'}</button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (mode === 'radio' && radioGardenMode) ? null : mode === 'tv' ? null : (mode === 'radio' ? filteredStations.slice(0, visibleStationCount) : visibleTracks.slice(trackPage * PAGE_SIZE, (trackPage + 1) * PAGE_SIZE)).map((item) => {
              const selected = mode === 'radio' ? currentStation?.id === item.id : currentTrack?.id === item.id
              const flag = mode === 'radio' ? countryFlagEmoji(item.countryCode) : 'YT'
              const art = mode === 'radio'
                ? safeArt(item.favicon, item.name, 'radio')
                : safeArt(item.thumbnail, item.title, 'track')
              const canSuggest = mode === 'player'
              return (
                <LibraryItem
                  key={item.id}
                  item={item}
                  selected={selected}
                  mode={mode}
                  activeTrackRef={activeTrackRef}
                  art={art}
                  flag={flag}
                  canSuggest={canSuggest}
                  isSuggested={suggestedIds.has(item.id)}
                  onSelect={handleItemSelect}
                  onSuggest={handleItemSuggest}
                />
              )
            })}

            {mode === 'radio' && filteredStations.length > visibleStationCount && (
              <div ref={stationListSentinelRef} style={{ height: 1 }} />
            )}
            {mode === 'player' && visibleTracks.length > PAGE_SIZE && (
              <div className="track-pagination">
                <button className="load-more-btn" disabled={trackPage === 0} onClick={() => { setTrackPage(p => p - 1); libraryListRef.current && (libraryListRef.current.scrollTop = 0) }}>
                  ÔćÉ Poprzednie
                </button>
                <span>{trackPage * PAGE_SIZE + 1}ÔÇô{Math.min((trackPage + 1) * PAGE_SIZE, visibleTracks.length)} / {visibleTracks.length}</span>
                <button className="load-more-btn" disabled={(trackPage + 1) * PAGE_SIZE >= visibleTracks.length} onClick={() => { setTrackPage(p => p + 1); libraryListRef.current && (libraryListRef.current.scrollTop = 0) }}>
                  Nast─Öpne Ôćĺ
                </button>
              </div>
            )}
            {mode !== 'tv' && libraryView !== 'chat' && libraryView !== 'similar' && !(mode === 'radio' && radioGardenMode) && libraryView !== 'suggested' && (mode === 'radio' ? filteredStations : visibleTracks).length === 0 ? (
              <div className="empty-state">
                {libraryView === 'favorites'
                  ? 'Brak ulubionych w tym trybie.'
                  : mode === 'radio'
                    ? stationSearchTerm.trim()
                      ? 'Brak stacji dla wpisanej frazy.'
                      : 'Brak stacji dla wybranego kraju.'
                    : 'Brak utwor├│w dla tej frazy.'}
              </div>
            ) : null}

            {mode === 'player' && libraryView === 'all' && trackHistory.length > 0 ? (
              <div className="previous-section">
                <button
                  className="history-toggle"
                  onClick={() => setHistoryExpanded((v) => !v)}
                >
                  <span>Historia odtwarzania ({trackHistory.length})</span>
                  <span className="history-chevron">{historyExpanded ? 'Ôľ▓' : 'Ôľ╝'}</span>
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
                      <span>{[entry.track.author, entry.track.duration].filter(Boolean).join(' ÔÇó ')}</span>
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
          {mode === 'tv' ? (
            <>
              {tvSubMode === 'youtube'
                ? tvYtThumbnail
                  ? <img key="tv-yt-art" src={tvYtThumbnail} alt="" style={{ width: 48, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  : <div key="tv-yt-art" style={{ width: 48, height: 36, borderRadius: 6, background: 'rgba(255,50,50,0.12)', border: '1px solid rgba(255,80,80,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="#ff6060"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg></div>
                : currentTvChannel?.logo
                  ? <img key="tv-art" src={safeArt(sanitizeTvLogoUrl(currentTvChannel.logo), currentTvChannel?.name, 'radio')} alt="" style={{ borderRadius: 8, objectFit: 'contain', background: 'rgba(255,255,255,0.07)' }} onError={e => withFallbackArt(e, currentTvChannel?.name, 'radio')} />
                  : <div key="tv-art" style={{ width: 48, height: 48, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(200,215,230,0.5)"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg></div>
              }
              <div className="bottom-nowcopy">
                <p className="bottom-label">{tvSubMode === 'youtube' ? 'YouTube' : 'Teraz ogl─ůdasz'}</p>
                <p className="title-single-text compact">{tvSubMode === 'youtube' ? (tvYtTitle || tvYoutubeUrl || 'Wklej link YouTube') : (currentTvChannel?.name || 'Wybierz kana┼é')}</p>
              </div>
            </>
          ) : (
            <>
              <img
                key="music-art"
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
            </>
          )}
        </div>

        <div className="bottom-center">
          <div className="bottom-controls">
            {mode === 'tv' ? (
              <>
                <button className="player-button ghost" onClick={() => {
                  if (tvSubMode === 'youtube') {
                    if (!checkPerm('canPlay')) return
                    const iframe = tvYtIframeRef.current
                    if (!iframe) return
                    const nextPlaying = !tvYtPlaying
                    const func = nextPlaying ? 'playVideo' : 'pauseVideo'
                    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: '' }), 'https://www.youtube-nocookie.com')
                    setTvYtPlaying(nextPlaying)
                    if (isHost) syncTvPositionNow(tvYtCurrentTime)
                    else if (inSession) notifyAction('tvPlayPause', { playing: nextPlaying })
                  } else {
                    const el = tvVideoRef.current
                    if (!el) return
                    if (tvIsPlaying) { el.pause(); setTvIsPlaying(false) }
                    else { el.play().catch(() => {}); setTvIsPlaying(true) }
                  }
                }}>
                  {(tvSubMode === 'youtube' ? tvYtPlaying : tvIsPlaying) ? 'Pause' : 'Play'}
                </button>
                {tvSubMode !== 'youtube' && (
                  <button className="player-button ghost" onClick={() => {
                    if (tvVideoRef.current) { tvVideoRef.current.currentTime = 0; tvVideoRef.current.play().catch(() => {}) }
                  }}>Ôč│ Od nowa</button>
                )}
              </>
            ) : mode === 'player' ? (
              <button className="player-button ghost" onClick={() => handleTrackPrevious(isTrackPlaying)}>
                Poprzednie
              </button>
            ) : null}

            {mode !== 'tv' && (
              <button className="player-button ghost" onClick={handlePlayPause}>
                {mode === 'radio'
                  ? isRadioPlaying ? 'Pause' : 'Play'
                  : isTrackPlaying ? 'Pause' : 'Play'}
              </button>
            )}

            {mode === 'radio' ? (
              <button className="player-button primary" onClick={handleStationNext} disabled={inSession && !isHost && !myPermissions.canSkip}>Nastepne</button>
            ) : mode === 'player' ? (
              <>
                <button className="player-button primary" onClick={() => handleTrackNext(isTrackPlaying)}>
                  {loadingMoreTracks ? 'Ladowanie...' : 'Dalej'}
                </button>
                <button className="player-button ghost" onClick={pickRandomTrack}>Losuj</button>
              </>
            ) : null}
          </div>

          {mode === 'tv' ? (
            tvSubMode === 'youtube' ? (() => {
              if (tvYtDuration > 0) {
                const pct = Math.min(100, (tvYtCurrentTime / tvYtDuration) * 100).toFixed(2)
                return (
                  <div className="bottom-track">
                    <span>{formatSeconds(Math.round(tvYtCurrentTime))}</span>
                    <div className="track-slider-wrap">
                      <div className="track-slider-fill" style={{ '--pct': `${pct}%` }} />
                      <div className="track-slider-thumb" style={{ '--pct': `${pct}%` }} />
                      <input
                        className="track-slider-input"
                        type="range" min="0" max={Math.ceil(tvYtDuration)} step="1"
                        value={Math.round(tvYtCurrentTime)}
                        onChange={e => {
                          if (!checkPerm('canPlay')) return
                          const v = Number(e.target.value)
                          setTvYtCurrentTime(v)
                          tvYtIframeRef.current?.contentWindow?.postMessage(
                            JSON.stringify({ event: 'command', func: 'seekTo', args: [v, true] }),
                            'https://www.youtube-nocookie.com'
                          )
                        }}
                        onMouseUp={e => {
                          if (!checkPerm('canPlay')) return
                          const v = Number(e.currentTarget.value)
                          if (isHost) syncTvPositionNow(v)
                          else if (inSession) notifyAction('tvSeek', { position: v })
                        }}
                        onTouchEnd={e => {
                          if (!checkPerm('canPlay')) return
                          const v = Number(e.currentTarget.value)
                          if (isHost) syncTvPositionNow(v)
                          else if (inSession) notifyAction('tvSeek', { position: v })
                        }}
                      />
                    </div>
                    <span>{formatSeconds(Math.round(tvYtDuration))}</span>
                  </div>
                )
              }
              return (
                <div className="tv-live-simple">
                  <span className={`tv-live-dot${tvYtPlaying ? ' on' : ''}`} />
                  <span>{tvYtPlaying ? 'LIVE' : 'STOP'}</span>
                </div>
              )
            })() : tvHasDvr && tvSeekableEnd > tvSeekableStart ? (() => {
              // Pasek DVR ÔÇö pokazuj tylko ostatnie 3 minuty (rolling window) dla p┼éynniejszego seeka.
              const dvrEnd = Math.max(tvSeekableStart, tvSeekableEnd - TV_DVR_LIVE_BUFFER)
              const dvrStart = Math.max(tvSeekableStart, dvrEnd - TV_DVR_MAX_WINDOW_SECONDS)
              const dvrRange = Math.max(1, dvrEnd - dvrStart)
              const clampedTime = Math.min(dvrEnd, Math.max(dvrStart, tvCurrentTime))
              const pct = Math.min(100, ((clampedTime - dvrStart) / dvrRange) * 100).toFixed(2)
              const behindSec = Math.max(0, Math.ceil(dvrEnd - clampedTime))
              const isAtLive = behindSec <= 1
              return (
                <div className="bottom-track tv-dvr-track">
                  <span className="tv-dvr-behind">
                    {isAtLive ? 'LIVE' : `-${formatSeconds(behindSec)}`}
                  </span>
                  <div className="track-slider-wrap">
                    <div className="track-slider-fill" style={{ '--pct': `${pct}%` }} />
                    <div className="track-slider-thumb" style={{ '--pct': `${pct}%` }} />
                    <input
                      className="track-slider-input"
                      type="range"
                      min={Math.floor(dvrStart)}
                      max={Math.ceil(dvrEnd)}
                      step="1"
                      value={Math.round(clampedTime)}
                      onChange={e => {
                        const v = Math.min(Math.ceil(dvrEnd), Math.max(Math.floor(dvrStart), Number(e.target.value)))
                        if (tvVideoRef.current) tvVideoRef.current.currentTime = v
                        setTvCurrentTime(v)
                      }}
                    />
                  </div>
                  <button
                    className={`tv-live-btn${isAtLive ? ' active' : ''}`}
                    onClick={() => {
                      const el = tvVideoRef.current
                      if (!el || el.seekable.length === 0) return
                      const seekStart = el.seekable.start(0)
                      const seekEnd = el.seekable.end(0)
                      const liveTarget = Math.max(seekStart, seekEnd - TV_DVR_LIVE_BUFFER)
                      el.currentTime = liveTarget
                      setTvCurrentTime(liveTarget)
                      el.play?.().then(() => setTvIsPlaying(true)).catch(() => recoverTvStream())
                    }}
                  >ÔŚĆ LIVE</button>
                </div>
              )
            })() : (
              <div className="tv-live-simple">
                <span className={`tv-live-dot${tvIsPlaying ? ' on' : ''}`} />
                <span>{tvIsPlaying ? 'LIVE' : 'STOP'}</span>
              </div>
            )
          ) : mode === 'radio' ? (
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
                  <div ref={seekBufferRef} className="track-slider-buffer" />
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
            aria-label={volumePercent === 0 ? 'W┼é─ůcz d┼║wi─Ök' : 'Wycisz'}
            title={volumePercent === 0 ? 'W┼é─ůcz d┼║wi─Ök' : 'Wycisz'}
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
            <button className="together-modal-close" onClick={() => setSessionModalOpen(false)}>ÔťĽ</button>
            <h2>S┼éuchaj razem</h2>

            {!inSession ? (
              <>
                <div className="together-nickname-row">
                  <label className="together-nickname-label">Tw├│j nick</label>
                  <input
                    className="together-nickname-input"
                    placeholder="Wpisz sw├│j nick..."
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
                  {togetherLoading ? 'Tworzenie...' : 'Utw├│rz sesj─Ö'}
                </button>

                <div className="together-divider">lub do┼é─ůcz</div>

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
                    {togetherLoading ? 'Do┼é─ůczanie...' : 'Do┼é─ůcz'}
                  </button>
                </div>

                {togetherError && <p className="together-error">{togetherError}</p>}
              </>
            ) : (
              <>
                <div className="together-session-info">
                  {isHost ? (
                    <>
                      <p className="together-label">Tw├│j kod sesji</p>
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
                        {listenerCount} {listenerCount === 1 ? 'osoba s┼éucha' : 'osoby s┼éuchaj─ů'}
                      </p>

                      {sessionListeners.length > 0 && (
                        <div className="together-listeners-list">
                          <p className="together-perm-header">Uprawnienia s┼éuchaczy</p>
                          {sessionListeners.map(l => {
                            const isMod = l.canPlay && l.canSkip && l.canAdd
                            return (
                              <div key={l.key} className="together-listener-row">
                                <span className="together-listener-nick">{l.nickname}</span>
                                <button
                                  className={`together-perm-btn ${isMod ? 'active' : ''}`}
                                  onClick={() => setModerator(l.key, !isMod)}
                                >
                                  {isMod ? 'Ôśů Moderator' : 'Ôść Moderator'}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="together-label">Po┼é─ůczono z sesj─ů</p>
                      <div className="together-code-display">{sessionCode}</div>
                      <p className="together-listeners">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                        {listenerCount} {listenerCount === 1 ? 'osoba s┼éucha' : 'osoby s┼éuchaj─ů'}
                      </p>
                      <div className="together-my-perms">
                        <p className="together-perm-header">Twoje uprawnienia</p>
                        <div className="together-perm-status-row">
                          {myPermissions.canPlay && myPermissions.canSkip && myPermissions.canAdd
                            ? <span className="together-perm-status on">Ôśů Moderator</span>
                            : <span className="together-perm-status off">Brak uprawnie┼ä</span>
                          }
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <button className="together-leave-btn" onClick={leaveSession}>
                  {isHost ? 'Zako┼äcz sesj─Ö' : 'Opu┼Ť─ç sesj─Ö'}
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
      const copyText = `[OnePlayer - b┼é─ůd sesji]\n${sessionEndedMsg}\nWersja: ${appVersion}\nCzas: ${new Date().toLocaleString('pl-PL')}`
      return (
        <div className="session-ended-overlay">
          <div className="session-ended-modal">
            <div className="session-ended-icon">ÔÜí</div>
            <h2 className="session-ended-title">Sesja zako┼äczona</h2>
            <p className="session-ended-reason">{mainMsg}</p>
            {hasDetails && (
              <div className="session-ended-error-box">
                <span className="session-ended-error-text">{details}</span>
                <button
                  className="session-ended-copy"
                  onClick={() => navigator.clipboard.writeText(copyText)}
                  title="Skopiuj b┼é─ůd"
                >
                  ­čôő Kopiuj b┼é─ůd
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
          <span className="ping-label">ÔĆż OFF</span>
        ) : (
          <span className="ping-label">{pingMs < 0 ? '├Ś' : `${pingMs >= 1000 ? '999+' : pingMs}ms`}</span>
        )}
      </div>
    )}

    {monopolyOpen && (
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
    )}

    {gameLobbyOpen && (
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
    )}

    {showSizePanel && createPortal(
      <div className="size-panel">
        <div className="size-panel-title">Rozmiar okna</div>
        <div className="size-panel-list">
          {ZOOM_NAMES.map((name, i) => (
            <button
              key={i}
              className={`size-option${i === (pendingZoom ?? zoomIdx) ? ' selected' : ''}`}
              onClick={() => setPendingZoom(i === zoomIdx ? null : i)}
            >{name}{i === zoomIdx ? ' Ôťô' : ''}</button>
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
