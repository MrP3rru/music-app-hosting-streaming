import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import './RadioPWA.css'
import { ref as fbRef, onValue, push, set, remove, onDisconnect, serverTimestamp } from 'firebase/database'
import { db } from './firebase'

// ─── Curated Polish stations ──────────────────────────────────────────────────
function _s(id, name, tags, bitrate, urls, favicon = '') {
  return { id: `pw-${id}`, name, tags, bitrate, favicon, votes: 9999, streamCandidates: [...urls], url: urls[0] }
}

// NOTE: All URLs verified HTTPS with audio/mpeg or audio/aacp Content-Type (2026-04-10)
// ⚠ Servers using SHOUTcast v1 return Content-Type: text/html — Chrome ORB blocks these for <audio>
// Only use streams that return audio/* Content-Type
const CURATED = [
  // ─── Główne ───────────────────────────────────────────────────────────────
  _s('rmffm',      'RMF FM',                  'pop,hits,polskie',   128, ['https://rs9-krk2.rmfstream.pl/RMFFM48','https://rs202-krk.rmfstream.pl/rmf_fm'], 'https://www.rmf.fm/favicon.ico'),
  _s('radiozet',   'Radio ZET',               'pop,hits,polskie',   128, ['https://zt01.cdn.eurozet.pl/zet-net.mp3'], 'https://www.radiozet.pl/favicon.ico'),
  _s('eska_glowna','Radio Eska',              'pop,hits,polskie',   128, ['https://ic2.smcdn.pl/3990-1.aac','https://ic1.smcdn.pl/3990-1.aac'], 'https://www.eska.pl/favicon.ico'),
  _s('vibefm',     'Vibe FM',                 'dance,electronic,hits,polskie', 128, ['https://ic2.smcdn.pl/6490-1.aac','https://ic1.smcdn.pl/6490-1.aac'], 'https://www.vibefm.pl/favicon.ico'),
  _s('meloradio',  'Meloradio',               'pop,ballads,polskie', 128, ['https://ml02.cdn.eurozet.pl/mel-wro.mp3','https://ml.cdn.eurozet.pl/mel-net.mp3'], ''),
  _s('antyradio',  'Antyradio',               'rock,polskie',        128, ['https://an03.cdn.eurozet.pl/ant-waw.mp3','https://an01.cdn.eurozet.pl/ant-waw.mp3'], 'https://www.antyradio.pl/favicon.ico'),
  _s('voxfm',      'VOX FM',                  'pop,polskie',         128, ['https://ic2.smcdn.pl/3990-1.mp3','https://ic1.smcdn.pl/3990-1.mp3'], ''),
  _s('tokfm',      'TOK FM',                  'news,talk,polskie',   128, ['https://radiostream.pl/tuba10-1.mp3'], 'https://www.tokfm.pl/favicon.ico'),
  _s('radio357',   'Radio 357',               'pop,rock,polskie',    128, ['https://stream.radio357.pl'], ''),
  _s('chillizet',  'Chilli ZET',              'pop,hits,polskie',    128, ['https://ch.cdn.eurozet.pl/chi-net.mp3'], ''),
  // ─── Impreza / Praca / Hits (Zastępstwa Open FM) ────────────────────────
  _s('eska_impreza','Eska IMPREZA',           'dance,electronic,hits', 128, ['https://ic2.smcdn.pl/2180-1.aac','https://ic1.smcdn.pl/2180-1.aac'], ''),
  _s('eska_hits',  'Eska 100% HITS',          'pop,hits',            128, ['https://ic2.smcdn.pl/2110-1.aac','https://ic1.smcdn.pl/2110-1.aac'], ''),
  _s('eska_rock',  'Eska ROCK',               'rock',                128, ['https://ic2.smcdn.pl/5380-1.aac','https://ic1.smcdn.pl/5380-1.aac'], 'https://www.eskarock.pl/favicon.ico'),
  _s('zloteprzeboje','Złote Przeboje',        'pop,retro,polskie',   128, ['https://radiostream.pl/tuba9-1.mp3', 'https://radiostream.pl/tuba10-1.mp3'], 'https://zloteprzeboje.pl/favicon.ico'),
  // ─── Open FM (Bramka getradio.reconv.pl) ────────────────────────────────
  _s('ofm_trap_pl',  'OpenFM TRAP PL',          'hip-hop,rap,trap',    128, ['https://getradio.reconv.pl/openfm?s=trap-pl'], 'https://v.wpimg.pl/NzVkLmpwYRs3CTpeXwxsDnRRbgQZVWJYI0l2T19BfkouRCMdFRkoF3sePAEfFipXNxslQwcHLR44RTwBXxYoGGddKFgUWipPZlphWUZGe1dvXXUMXUAoT2JTLVUVQ3lPMkUmHRdVMw'),
  _s('ofm_hip_hop',  'OpenFM Hip-Hop Klasyk',   'hip-hop,rap',         128, ['https://getradio.reconv.pl/openfm?s=hip-hop-klasyk'], 'https://v.wpimg.pl/YWI4LmpwdjYoVjpeXwx7I2sObgQZVXV1PBZ2T19BaWcxGyMdFRk_OmRBPAEfFj16KEQlQwcHOjMnGjwBX0U4YS9XdF9BWjhiewNhWRJEbXpwDC4PXRE7ZX4GKFURETg1cRomHRdVJA'),
  _s('ofm_impreza',  'OpenFM Impreza',          'dance,electronic,hits', 128, ['https://getradio.reconv.pl/openfm?s=impreza'], 'https://v.wpimg.pl/MTAwLmpwYjUgFTpeXwxvIGNNbgQZVWF2NFV2T19BfWQ5WCMdFRkrOWwCPAEfFil5IAclQwcHLjAvWTwBXxN6bHdHKQtCWn9tdEdhWRZOeXkgESpeXUd5NyVCfl1CQXxkcVkmHRdVMA'),
  _s('ofm_dance',    'OpenFM Dance',            'dance,electronic',    128, ['https://getradio.reconv.pl/openfm?s=dance'], 'https://v.wpimg.pl/Yzk2LmpwdhsKUDpeXwx7DkkIbgQZVXVYHhB2T19BaUoTHSMdFRk_F0ZHPAEfFj1XCkIlQwcHOh4FHDwBX0FrSV1Uew5JWj1CXQZhWRNEP1dSV3kMXRU8Hg4Cf1pHFjpDXRwmHRdVJA'),
  _s('ofm_disco_hity','OpenFM Hity Disco Polo', 'dance,electronic',    128, ['https://getradio.reconv.pl/openfm?s=hity-disco-polo'], 'https://v.wpimg.pl/OTY4LmpwYDU4VjpeXwxtIHsObgQZVWN2LBZ2T19Bf2QhGyMdFRkpOXRBPAEfFit5OEQlQwcHLDA3GjwBXxR2ZW4CKVRHWntlOARhWRVDLnk4V3tcXRV-YW1RdF5GRnZiYRomHRdVMg'),
  _s('ofm_praca',    'OpenFM Praca',            'pop,hits',            128, ['https://getradio.reconv.pl/openfm?s=praca'], 'https://v.wpimg.pl/MDljLmpwYiUNCDpeXwxvME5QbgQZVWFmGUh2T19BfXQURSMdFRkrKUEfPAEfFilpDRolQwcHLiACRDwBX0MuJ11eLVhIWilzXV9hWUESdWkNXC4PXRMpIVUIdA5DQX19D0QmHRdVMA'),
  _s('ofm_100_hits', 'OpenFM 100% Hits',        'pop,hits',            128, ['https://getradio.reconv.pl/openfm?s=100-hits'], 'https://v.wpimg.pl/NWZjLmpwYTY7CDpeXwxsI3hQbgQZVWJ1L0h2T19BfmciRSMdFRkoOncfPAEfFip6OxolQwcHLTM0RDwBXxZ_NGxSdF9CWn5mb1thWUlAfno7DHlfXUJ_b2tefw5ATnsxOUQmHRdVMw'),
  _s('ofm_w_domu',   'OpenFM W Domu',           'chillout,pop',        128, ['https://getradio.reconv.pl/openfm?s=w-domu'], 'https://v.wpimg.pl/N2IxLmpwYVMoGjpeXwxsRmtCbgQZVWIQPFp2T19BfgIxVyMdFRkoX2QNPAEfFiofKAglQwcHLVYnVjwBX0IvVHxAeV5BWi1UcU1hWUkSdh9xTXhdXUcvBXBIfV5DQHlQeFYmHRdVMw'),
  _s('ofm_hity_top', 'OpenFM Hity Na Topie',    'pop,hits',            128, ['https://getradio.reconv.pl/openfm?s=hity-na-topie'], 'https://v.wpimg.pl/YzYwLmpwdhs4FTpeXwx7DntNbgQZVXVYLFV2T19BaUohWCMdFRk_F3QCPAEfFj1XOAclQwcHOh43WTwBX0ZqHmkRel8UWmpMO0RhWRNGbVc7FXpbXU9uSm4Te1xGEzpMaVkmHRdVJA'),
  _s('ofm_disco',    'OpenFM Disco Polo',       'dance,electronic',    128, ['https://getradio.reconv.pl/openfm?s=disco-polo'], 'https://v.wpimg.pl/ZmNlLmpwdQwvDjpeXwx4GWxWbgQZVXZPO052T19Bal02QyMdFRk8AGMZPAEfFj5ALxwlQwcHOQkgQjwBX0Y4CHhbLwsVWj5ZfQ1hWRQWb0B2X3gLXU4_DnpVLQgVQDwOK0ImHRdVJw'),
  _s('ofm_tylko_pl', 'OpenFM Tylko Polskie Przeboje','pop,polskie',    128, ['https://getradio.reconv.pl/openfm?s=tylko-polskie-przeboje'], 'https://v.wpimg.pl/NDE0LmpwYSUkUjpeXwxsMGcKbgQZVWJmMBJ2T19BfnQ9HyMdFRkoKWhFPAEfFippJEAlQwcHLSArHjwBX0V4cCAJf1tHWi12JwJhWRMRL2l8A3tYXUV3cXJUeFQTRXp1cR4mHRdVMw'),
  _s('ofm_naj_bity', 'OpenFM Najlepsze Polskie Bity','pop,dance,polskie',128, ['https://getradio.reconv.pl/openfm?s=najlepsze-polskie-bity'], 'https://v.wpimg.pl/ZjhiLmpwdQsJCzpeXwx4HkpTbgQZVXZIHUt2T19BaloQRiMdFRk8B0UcPAEfFj5HCRklQwcHOQ4GRzwBXxFoU1ENelpCWjxZCw1hWRZEP0dRD3UIXUI7XgoMdVlCTjxSCkcmHRdVJw'),
  _s('ofm_hiphop_usa','OpenFM Hip-Hop USA',     'hip-hop,rap',         128, ['https://getradio.reconv.pl/openfm?s=hip-hop-usa'], 'https://v.wpimg.pl/ZjNjLmpwdQsvCDpeXwx4HmxQbgQZVXZIO0h2T19Balo2RSMdFRk8B2MfPAEfFj5HLxolQwcHOQ4gRDwBX05vXHwPe1tBWj8LKFphWUgWY0d2XikPXRE8XXoPKQlFRjxZLUQmHRdVJw'),
  _s('ofm_edm',      'OpenFM EDM Anthems',      'dance,electronic',    128, ['https://getradio.reconv.pl/openfm?s=edm-anthems'], 'https://v.wpimg.pl/OTlmLmpwYDUNDzpeXwxtIE5XbgQZVWN2GU92T19Bf2QUQiMdFRkpOUEYPAEfFit5DR0lQwcHLDACQzwBX0csZQ9delVEWixjXl1hWRNOenlVWnRVXUEsYV9UeFkVFHZtCkMmHRdVMg'),
  _s('ofm_80s_90s',  'OpenFM 80s 90s Hits',     'retro,80s,90s',       128, ['https://getradio.reconv.pl/openfm?s=80s-90s-hits'], 'https://v.wpimg.pl/ZTc3LmpwdTUCUTpeXwx4IEEJbgQZVXZ2FhF2T19BamQbHCMdFRk8OU5GPAEfFj55AkMlQwcHOTANHTwBXxNoNwJQeFhEWmlsBQVhWRVPO3laUXwLXUA5YgICfQ9AQj9jVB0mHRdVJw'),
  _s('ofm_80s',      'OpenFM 80s Hits',         'retro,80s',           128, ['https://getradio.reconv.pl/openfm?s=80s-hits'], 'https://v.wpimg.pl/MjM1LmpwYgssUzpeXwxvHm8LbgQZVWFIOBN2T19BfVo1HiMdFRkrB2BEPAEfFilHLEElQwcHLg4jHzwBX0F_XilSfFVHWn0MfFdhWRRFeUcvBioIXRIoWykIfV5CEX9ZeB8mHRdVMA'),
  _s('ofm_70_80_90', 'OpenFM Hity lat 70 80 90','retro,oldies',        128, ['https://getradio.reconv.pl/openfm?s=hity-lat-70-80-90'], 'https://v.wpimg.pl/YjMzLnBudgssGDpdbQ57Hm9AbgcrV3VIOFh2TG1DaVo1VSMeJxs_B2APPAItFD1HLAolQDUFOg4jVDwCbRQ9WyxMfVx6WGxdfB5hWnpGbEcsQ3Rfb004CHlJel91RDtZflQ8ACVXJA'),
  _s('ofm_popl_80',  'OpenFM Po Polsku 80',     'retro,polskie,80s',   128, ['https://getradio.reconv.pl/openfm?s=po-polsku-80'], 'https://v.wpimg.pl/YjI0LmpwdgsoUjpeXwx7HmsKbgQZVXVIPBJ2T19BaVoxHyMdFRk_B2RFPAEfFj1HKEAlQwcHOg4nHjwBXxJtCXlVfVRCWm5dLVVhWUkWaEcrAi1VXUVqU3wCKF8SRTtYfR4mHRdVJA'),
  _s('ofm_po_polsku','OpenFM Po Polsku',        'pop,rock,polskie',    128, ['https://getradio.reconv.pl/openfm?s=po-polsku'], 'https://v.wpimg.pl/ZGNlLmpwdSYvDjpeXwx4M2xWbgQZVXZlO052T19Banc2QyMdFRk8KmMZPAEfFj5qLxwlQwcHOSMgQjwBX0U7d35afFhCWmohd1phWRESbmp2Dn5ZXUA_cy9VeQgUQD4kK0ImHRdVJw'),
  _s('ofm_pl_caly_dz','OpenFM Polskie na Cały Dzień','pop,polskie',    128, ['https://getradio.reconv.pl/openfm?s=polskie-na-caly-dzien'], 'https://v.wpimg.pl/ZTFlLmpwdTUnDjpeXwx4IGRWbgQZVXZ2M052T19BamQ-QyMdFRk8OWsZPAEfFj55JxwlQwcHOTAoQjwBXxY5Mn9eKllFWjtmdl5hWRJDPnl_CnpUXU87YyBbeFQVQD9lI0ImHRdVJw'),
  _s('ofm_polo_dance','OpenFM Polo & Dance',    'dance,electronic',    128, ['https://getradio.reconv.pl/openfm?s=polo-dance'], 'https://v.wpimg.pl/MWNmLmpwYjYvDzpeXwxvI2xXbgQZVWF1O092T19BfWc2QiMdFRkrOmMYPAEfFil6Lx0lQwcHLjMgQzwBX0V-YXtaflkTWihgfFphWRNPenosX3laXRR6MypaKgtBRXw0KEMmHRdVMA'),
  _s('ofm_pop_caly', 'OpenFM Pop Na Cały Dzień','pop',                 128, ['https://getradio.reconv.pl/openfm?s=pop-na-caly-dzien'], 'https://v.wpimg.pl/M2VjLmpwYlM3CDpeXwxvRnRQbgQZVWEQI0h2T19BfQIuRSMdFRkrX3sfPAEfFikfNxolQwcHLlY4RDwBX05-VmVYL1lDWn4EYgxhWUYUKx83CH5dXU50V29efl1EFX5XNUQmHRdVMA'),
  _s('ofm_rock_caly','OpenFM Rock Na Cały Dzień','rock',               128, ['https://getradio.reconv.pl/openfm?s=rock-na-caly-dzien'], 'https://v.wpimg.pl/OGQ2LmpwYCYwUDpeXwxtM3MIbgQZVWNlJBB2T19Bf3cpHSMdFRkpKnxHPAEfFitqMEIlQwcHLCM_HDwBX0F9cGkHKlVAWnsjYQthWUlCdmppU3QPXUQsdDAEeF5BQncjZxwmHRdVMg'),
  _s('ofm_ladies',   'OpenFM Ladies Party',     'pop,dance',           128, ['https://getradio.reconv.pl/openfm?s=ladies-party'], 'https://v.wpimg.pl/OWY2LmpwYDY4UDpeXwxtI3sIbgQZVWN1LBB2T19Bf2chHSMdFRkpOnRHPAEfFit6OEIlQwcHLDM3HDwBXxUrNWsEelVDWnxgbwVhWURDeHpgA3oMXUd8NWFReFtDFnYxbxwmHRdVMg'),
  _s('ofm_chill_caly','OpenFM Chill Na Cały Dzień','chillout',         128, ['https://getradio.reconv.pl/openfm?s=chill-na-caly-dzien'], 'https://v.wpimg.pl/YjRkLmpwdgszCTpeXwx7HnBRbgQZVXVIJ0l2T19BaVoqRCMdFRk_B38ePAEfFj1HMxslQwcHOg48RTwBXxJgDmUPeFwRWjxaaw9hWUAWPUdrXX9VXRVvD2cIL15EEzteNkUmHRdVJA'),
  _s('ofm_classic_pty','OpenFM Classic Party',  'retro,dance',         128, ['https://getradio.reconv.pl/openfm?s=classic-party'], 'https://v.wpimg.pl/ZmIwLmpwdQwoFTpeXwx4GWtNbgQZVXZPPFV2T19Bal0xWCMdFRk8AGQCPAEfFj5AKAclQwcHOQknWTwBX0A8DCtELQ4RWjwIf0dhWUBAP0AoEy8PXRQ8DywVfV5DQjwPeVkmHRdVJw'),
  _s('ofm_spokojne', 'OpenFM Spokojne Hity',    'chillout,ballads',    128, ['https://getradio.reconv.pl/openfm?s=spokojne-hity'], 'https://v.wpimg.pl/YjY5Lmpwdgs4VzpeXwx7HnsPbgQZVXVILBd2T19BaVohGiMdFRk_B3RAPAEfFj1HOEUlQwcHOg43GzwBX0A4XG0MfVlFWjsLPFNhWRNEYUdgVC5eXUQ6W2AMellFQDtcYBsmHRdVJA'),
  _s('ofm_90s_chill','OpenFM 90s Chill',        'retro,chillout',      128, ['https://getradio.reconv.pl/openfm?s=90s-chill'], 'https://v.wpimg.pl/NThkLmpwYTUJCTpeXwxsIEpRbgQZVWJ2HUl2T19BfmQQRCMdFRkoOUUePAEfFip5CRslQwcHLTAGRTwBXxJ8bV1aKFVCWnZsX1hhWUEVfnkJXXxbXUAsNl9SKVsTQHtsDEUmHRdVMw'),
  _s('ofm_po_polsku_60_70', 'Po Polsku 60s &amp; 70s', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=po-polsku-60-70'], 'https://v.wpimg.pl/NDkyLmpwYSUKGzpeXwxsMElDbgQZVWJmHlt2T19BfnQTViMdFRkoKUYMPAEfFippCgklQwcHLSAFVzwBXxUqIA8bfVgSWih2CUBhWUhHfGkKQS1dXUB-dQ8cel8VEXp9WVcmHRdVMw'),
  _s('ofm_1001_hits', '1001 Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=1001-hits'], 'https://v.wpimg.pl/MzgzLmpwYhsGGDpeXwxvDkVAbgQZVWFYElh2T19BfUofVSMdFRkrF0oPPAEfFilXBgolQwcHLh4JVDwBX0J4HgEfflkWWilNV0lhWRYSdVdfHnpcXUR_HFJPKV4UQH5CVFQmHRdVMA'),
  _s('ofm_biesiada_slaska', 'Biesiada Śląska', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=biesiada-slaska'], 'https://v.wpimg.pl/NzI2LmpwYRsoUDpeXwxsDmsIbgQZVWJYPBB2T19BfkoxHSMdFRkoF2RHPAEfFipXKEIlQwcHLR4nHDwBX0coHn0ALVhHWnZLK1ZhWRMSKldxBHRYXUIsTHsAdAgTQHlIfxwmHRdVMw'),
  _s('ofm_weekend_chill', 'Weekend Chill', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=weekend-chill'], 'https://v.wpimg.pl/NGQzLmpwYSYwGDpeXwxsM3NAbgQZVWJlJFh2T19BfncpVSMdFRkoKnwPPAEfFipqMAolQwcHLSM_VDwBX0MsIjdCdQkTWn12YR9hWREVKmowGS5VXRQtcjUce19ARHojYlQmHRdVMw'),
  _s('ofm_vixa', 'Vixa', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=vixa'], 'https://v.wpimg.pl/Zjk3LmpwdQsKUTpeXwx4HkkJbgQZVXZIHhF2T19BaloTHCMdFRk8B0ZGPAEfFj5HCkMlQwcHOQ4FHTwBXxFvW14AfVQUWjtfXVFhWUdOP0dSBClZXRU8C1sGfwhETzxTXB0mHRdVJw'),
  _s('ofm_freszzz', 'Nowości', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=freszzz'], 'https://v.wpimg.pl/M2ExLmpwYlMkGjpeXwxvRmdCbgQZVWEQMFp2T19BfQI9VyMdFRkrX2gNPAEfFikfJAglQwcHLlYrVjwBXxYuAXNKL1lBWi8KIUBhWUJGfB98SCoOXRR0BHRNfQ4UTn5TdFYmHRdVMA'),
  _s('ofm_impreza_pl', 'Impreza PL', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=impreza-pl'], 'https://v.wpimg.pl/ZDNlLmpwdSUvDjpeXwx4MGxWbgQZVXZmO052T19BanQ2QyMdFRk8KWMZPAEfFj5pLxwlQwcHOSAgQjwBX0U7dXtZdF1FWmMheF1hWUEUbmksCntYXUNufXdcKVpHTj53K0ImHRdVJw'),
  _s('ofm_weekend_hits', 'Weekend Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=weekend-hits'], 'https://v.wpimg.pl/NDFmLmpwYSUnDzpeXwxsMGRXbgQZVWJmM092T19BfnQ-QiMdFRkoKWsYPAEfFippJx0lQwcHLSAoQzwBX0QocyAIeQsSWih2JAthWRZOe2knCH4IXUAoJ3FZe1lJRXp1IEMmHRdVMw'),
  _s('ofm_90s_hits', '90s Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=90s-hits'], 'https://v.wpimg.pl/MWE4LmpwYjYkVjpeXwxvI2cObgQZVWF1MBZ2T19BfWc9GyMdFRkrOmhBPAEfFil6JEQlQwcHLjMrGjwBX04uYnUFfA8UWnxgJAVhWUJOeHp8AS9YXUJ8YXYFLlhHFHw2fRomHRdVMA'),
  _s('ofm_to_jest_hip_hop', 'To Jest Hip-Hop', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=to-jest-hip-hop'], 'https://v.wpimg.pl/N2VlLmpwYVM3DjpeXwxsRnRWbgQZVWIQI052T19BfgIuQyMdFRkoX3sZPAEfFiofNxwlQwcHLVY4QjwBXxQqCjMKdVwSWi0EYQhhWRNAeR9vCClbXRYvVzQOeFVJQHlXM0ImHRdVMw'),
  _s('ofm_500_hip_hop_hit', '500 Hip-Hop Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=500-hip-hop-hits'], 'https://v.wpimg.pl/YTBiLmpwdjUjCzpeXwx7IGBTbgQZVXV2N0t2T19BaWQ6RiMdFRk_OW8cPAEfFj15IxklQwcHOjAsRzwBX0M4YyZaf18UWm4wJFhhWUdGaXkjC3gOXUBvNnZQdVpARzhkIEcmHRdVJA'),
  _s('ofm_top_hits', 'Top 2026 Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=top-hits'], 'https://v.wpimg.pl/ZDk2LmpwdSUKUDpeXwx4MEkIbgQZVXZmHhB2T19BanQTHSMdFRk8KUZHPAEfFj5pCkIlQwcHOSAFHDwBX0A5fV5WfVREWm9yWwthWUVAPGkKUCpYXU88J1sGLV0SRz59XRwmHRdVJw'),
  _s('ofm_popularne', 'Tego Się Słucha', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=popularne'], 'https://v.wpimg.pl/ZGE2LmpwdSYkUDpeXwx4M2cIbgQZVXZlMBB2T19Banc9HSMdFRk8KmhHPAEfFj5qJEIlQwcHOSMrHDwBX084JHMALgkTWj5xdQFhWUUWPGp8V35fXRM8cXZTdV8VRz4mcxwmHRdVJw'),
  _s('ofm_disco_polo_clas', 'Disco Polo Classic', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=disco-polo-classic'], 'https://v.wpimg.pl/YmU5Lmpwdgw0VzpeXwx7GXcPbgQZVXVPIBd2T19BaV0tGiMdFRk_AHhAPAEfFj1ANEUlQwcHOgk7GzwBX05uWzRQfAxEWmFUNgdhWUYRbkBtAXtcXUY9WWJTeFwUFDsIbBsmHRdVJA'),
  _s('ofm_00s_hits', 'Hity lat 2000.', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=00s-hits'], 'https://v.wpimg.pl/YzUzLmpwdhs0GDpeXwx7DndAbgQZVXVYIFh2T19BaUotVSMdFRk_F3gPPAEfFj1XNAolQwcHOh47VDwBXxE6HmcYLVgTWjxCbU5hWUYRbVdsTypYXRVoTzRLfw8UEjpPZlQmHRdVJA'),
  _s('ofm_na_gwiazdke', 'Na Gwiazdkę', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=na-gwiazdke'], 'https://v.wpimg.pl/NmFmLnBuYQwnDzpdbQ5sGWRXbgcrV2JPM092TG1Dfl0-QiMeJxsoAGsYPAItFCpAJx0lQDUFLQkoQzwCbRN-VH9af1sgWHwLIw9hWicQL0AnWHhZbxN6DCNYe1x0RXgMIEM8ACVXMw'),
  _s('ofm_10s_hits', '10s Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=10s-hits'], 'https://v.wpimg.pl/MjgwLmpwYgsGFTpeXwxvHkVNbgQZVWFIElV2T19BfVofWCMdFRkrB0oCPAEfFilHBgclQwcHLg4JWTwBXxEpWQYTKVUWWnlTBhVhWUdFLEdfTngIXRMsDlBFfFoRQH9SV1kmHRdVMA'),
  _s('ofm_drumnbass', 'Drum\'n\'Bass', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=drumnbass'], 'https://v.wpimg.pl/MzViLmpwYhs3CzpeXwxvDnRTbgQZVWFYI0t2T19BfUouRiMdFRkrF3scPAEfFilXNxklQwcHLh44RzwBX0R_GGJdKV9CWi4YZF5hWUZFL1c0DH5VXRZ0H28KLlQUR35PNEcmHRdVMA'),
  _s('ofm_summerpolo', 'Latino PL', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=summerpolo'], 'https://v.wpimg.pl/NGQwLmpwYSYwFTpeXwxsM3NNbgQZVWJlJFV2T19BfncpWCMdFRkoKnwCPAEfFipqMAclQwcHLSM_WTwBX0MtIzMVdVsWWnYjaUVhWRRPLWozRXpcXUN8I2dGeloSRnojYVkmHRdVMw'),
  _s('ofm_klub_90', '90s Dance', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=klub-90'], 'https://v.wpimg.pl/ZjU3LmpwdQs0UTpeXwx4HncJbgQZVXZIIBF2T19BalotHCMdFRk8B3hGPAEfFj5HNEMlQwcHOQ47HTwBX0RiU2YFf1lJWm4OYQFhWREWb0c3VX0LXRM_X2VQelwUQDxfYh0mHRdVJw'),
  _s('ofm_80s_rock', '80s Rock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=80s-rock'], 'https://v.wpimg.pl/YWNlLmpwdjYvDjpeXwx7I2xWbgQZVXV1O052T19BaWc2QyMdFRk_OmMZPAEfFj16LxwlQwcHOjMgQjwBX0RrZStefVQRWmpvLVphWRMVa3ovW3RZXRU_Yi8OKAgUQDg0K0ImHRdVJA'),
  _s('ofm_trening', 'Trening', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=trening'], 'https://v.wpimg.pl/NTQ4LmpwYTUwVjpeXwxsIHMObgQZVWJ2JBZ2T19BfmQpGyMdFRkoOXxBPAEfFip5MEQlQwcHLTA_GjwBXxR8YzUHL1QWWi9kYQ1hWRIWfXloDShcXRMsMmcMfV0UTntgaRomHRdVMw'),
  _s('ofm_house', 'Ibiza Party', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=house'], 'https://v.wpimg.pl/MTRhLmpwYjUzCjpeXwxvIHBSbgQZVWF2J0p2T19BfWQqRyMdFRkrOX8dPAEfFil5MxglQwcHLjA8RjwBX097MjZbKFRIWnRnMVhhWUdDeXlqXylVXUQoZmZbfQxGQnxgM0YmHRdVMA'),
  _s('ofm_do_auta_club', 'Do Auta Club', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=do-auta-club'], 'https://v.wpimg.pl/MDhkLmpwYiUJCTpeXwxvMEpRbgQZVWFmHUl2T19BfXQQRCMdFRkrKUUePAEfFilpCRslQwcHLiAGRTwBXxQucFxcdAlAWnx0X1hhWRIWe2lRWX4PXUZ8c1AOfwwRRX18DEUmHRdVMA'),
  _s('ofm_hip_hop_pl', 'Hip-Hop PL', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=hip-hop-pl'], 'https://v.wpimg.pl/MTU5LmpwYjU0VzpeXwxvIHcPbgQZVWF2IBd2T19BfWQtGiMdFRkrOXhAPAEfFil5NEUlQwcHLjA7GzwBX0UrNzMHfVpDWnpgZwdhWUMUeXk0BnlUXRN4MG1RKV8TQHxhbBsmHRdVMA'),
  _s('ofm_latino_hits', 'Latino Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=latino-hits'], 'https://v.wpimg.pl/ZGIzLmpwdSYoGDpeXwx4M2tAbgQZVXZlPFh2T19BancxVSMdFRk8KmQPPAEfFj5qKAolQwcHOSMnVDwBXxNsJXoff1URWmsmfBxhWRMWbGooHCkMXRJsJSpCeFhDRz4lelQmHRdVJw'),
  _s('ofm_biesiada', 'Biesiada', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=biesiada'], 'https://v.wpimg.pl/ZjU5LmpwdQs0VzpeXwx4HncPbgQZVXZIIBd2T19BalotGiMdFRk8B3hAPAEfFj5HNEUlQwcHOQ47GzwBXxE7XW1UeAlHWmJSbQNhWUUTY0dsBn9ZXUFsWDMBKVgUEjxfbBsmHRdVJw'),
  _s('ofm_beats_bass', 'Beats &amp; Bass', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=beats-bass'], 'https://v.wpimg.pl/YzY1Lmpwdhs4UzpeXwx7DnsLbgQZVXVYLBN2T19BaUohHiMdFRk_F3REPAEfFj1XOEElQwcHOh43HzwBX0RtGGpUfl9CWj1ObwlhWRJEb1dhU3kIXURhQzoHLlgVFDpMbB8mHRdVJA'),
  _s('ofm_w_podrozy', 'W Podróży', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=w-podrozy'], 'https://v.wpimg.pl/ZDkzLmpwdSUKGDpeXwx4MElAbgQZVXZmHlh2T19BanQTVSMdFRk8KUYPPAEfFj5pCgolQwcHOSAFVDwBX0RvcghKLVUTWm8lXB9hWUEVPmkJTXQIXUI4fFNMeF1AFT59WFQmHRdVJw'),
  _s('ofm_alt_freszzz', 'Świeże Dźwięki', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=alt-freszzz'], 'https://v.wpimg.pl/ZmQ4LmpwdQwwVjpeXwx4GXMObgQZVXZPJBZ2T19Bal0pGyMdFRk8AHxBPAEfFj5AMEQlQwcHOQk_GjwBX0duXmkEfw5IWmxYYVFhWUkVbEAzUShdXUVpXWcNeVRERjwJaRomHRdVJw'),
  _s('ofm_24h_party_best_', 'Viral FM', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=24h-party-best-djs'], 'https://v.wpimg.pl/YzEzLmpwdhskGDpeXwx7DmdAbgQZVXVYMFh2T19BaUo9VSMdFRk_F2gPPAEfFj1XJAolQwcHOh4rVDwBX08_HndPfFoRWmxDJ01hWUlDOFd8TikPXUFtSHMbdVhJQjpLdlQmHRdVJA'),
  _s('ofm_jazz', 'Jazz Cafe', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=jazz'], 'https://v.wpimg.pl/MmFiLmpwYgwnCzpeXwxvGWRTbgQZVWFPM0t2T19BfV0-RiMdFRkrAGscPAEfFilAJxklQwcHLgkoRzwBX0d1CyRRL1hCWixVdg9hWRVDeUB_XilcXRZ0W3YNKQsVRn8MJEcmHRdVMA'),
  _s('ofm_500_party_hits', '500 Party Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=500-party-hits'], 'https://v.wpimg.pl/NjNhLmpwYQsvCjpeXwxsHmxSbgQZVWJIO0p2T19Bflo2RyMdFRkoB2MdPAEfFipHLxglQwcHLQ4gRjwBX094XXwKdQgRWn4Odl1hWUQRKEcsWSpaXUZ_CCwJf1xHFXhZL0YmHRdVMw'),
  _s('ofm_koncentracja', 'Koncentracja', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=koncentracja'], 'https://v.wpimg.pl/OGNjLmpwYCYvCDpeXwxtM2xQbgQZVWNlO0h2T19Bf3c2RSMdFRkpKmMfPAEfFitqLxolQwcHLCMgRDwBXxQtcCtTLQxEWnxwfg5hWUdDf2ovCC1eXREqI3kMeVkREnckLUQmHRdVMg'),
  _s('ofm_radio_eska', 'Radio ESKA', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-eska'], 'https://v.wpimg.pl/NTMyLmpwYTUsGzpeXwxsIG9DbgQZVWJ2OFt2T19BfmQ1ViMdFRkoOWAMPAEfFip5LAklQwcHLTAjVzwBXxZ5ZCwfeQkSWncxLkthWRVFLXkvSXtcXUd8YywbLlhFR3tnf1cmHRdVMw'),
  _s('ofm_alt_club', 'Pełny Odlot', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=alt-club'], 'https://v.wpimg.pl/ZGE1LmpwdSYkUzpeXwx4M2cLbgQZVXZlMBN2T19Banc9HiMdFRk8KmhEPAEfFj5qJEElQwcHOSMrHzwBX087cCcIfFUVWjhxfAhhWUZGOWonUnxbXUZicCdTLlxEQT4mcB8mHRdVJw'),
  _s('ofm_praca_rock', 'Praca Rock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=praca-rock'], 'https://v.wpimg.pl/YTdmLmpwdjUFDzpeXwx7IEZXbgQZVXV2EU92T19BaWQcQiMdFRk_OUkYPAEfFj15BR0lQwcHOjAKQzwBXxFtNVFVfF1JWm1mU1RhWRUROnlcWHxUXUVpbFJffVgSFThjAkMmHRdVJA'),
  _s('ofm_hip_hop_freszzz', 'Hip-Hop Freszzz', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=hip-hop-freszzz'], 'https://v.wpimg.pl/MTJhLmpwYjUrCjpeXwxvIGhSbgQZVWF2P0p2T19BfWQyRyMdFRkrOWcdPAEfFil5KxglQwcHLjAkRjwBX0V9bSkLKl1AWn1tel1hWUIWdHlyCXlfXU97N3MOfVsVT3xmK0YmHRdVMA'),
  _s('ofm_szanty', 'Szanty', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=szanty'], 'https://v.wpimg.pl/MTBmLmpwYjUjDzpeXwxvIGBXbgQZVWF2N092T19BfWQ6QiMdFRkrOW8YPAEfFil5Ix0lQwcHLjAsQzwBX0R6MiMLKg5BWnxjcFhhWUhGfHkjDi5eXRN7MHZVeFQSRHxkJEMmHRdVMA'),
  _s('ofm_radiowe_hity', 'Radiowe Hity', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radiowe-hity'], 'https://v.wpimg.pl/ZGYyLmpwdSY4GzpeXwx4M3tDbgQZVXZlLFt2T19BanchViMdFRk8KnQMPAEfFj5qOAklQwcHOSM3VzwBXxJufjhLe1QRWjhxPEFhWUZEa2o4Sn4LXUBvdztLel1DTz4ha1cmHRdVJw'),
  _s('ofm_koledy', 'Kolędy', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=koledy'], 'https://v.wpimg.pl/N2E1LnBuYVMkUzpdbQ5sRmcLbgcrV2IQMBN2TG1DfgI9HiMeJxsoX2hEPAItFCofJEElQDUFLVYrHzwCbUF9CyYFdQsjWCgKfFJhWiFFeB98Ai4Kb00oBnwHfwsjFHlTcB88ACVXMw'),
  _s('ofm_ballady_wszech_', 'Ballady Wszech Czasów', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=ballady-wszech-czasow'], 'https://v.wpimg.pl/ZTQ5LmpwdTUwVzpeXwx4IHMPbgQZVXZ2JBd2T19BamQpGiMdFRk8OXxAPAEfFj55MEUlQwcHOTA_GzwBXxRtMDIDfAtDWm0yaQVhWUVDaHloDX1cXRNobDRQfAxGET9gaBsmHRdVJw'),
  _s('ofm_italo_disco', 'Italo Disco', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=italo-disco'], 'https://v.wpimg.pl/M2UwLmpwYlM0FTpeXwxvRndNbgQZVWEQIFV2T19BfQItWCMdFRkrX3gCPAEfFikfNAclQwcHLlY7WTwBX08vVzZGfQgSWn9WbBNhWUQRfR80QigPXRJ6B2cWKFkVT35XZVkmHRdVMA'),
  _s('ofm_top_wszech_czas', 'Top Wszech Czasów - Świat', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=top-wszech-czasow-swiat'], 'https://v.wpimg.pl/MjllLmpwYgsNDjpeXwxvHk5WbgQZVWFIGU52T19BfVoUQyMdFRkrB0EZPAEfFilHDRwlQwcHLg4CQjwBXxV8Ul0OfgtCWn5bXw5hWUBEfEcODn9YXU4pDltdeVhIEn9TCUImHRdVMA'),
  _s('ofm_kraina_lagodnos', 'Kraina Łagodności', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=kraina-lagodnosci'], 'https://v.wpimg.pl/NmMzLmpwYQwsGDpeXwxsGW9AbgQZVWJPOFh2T19Bfl01VSMdFRkoAGAPPAEfFipALAolQwcHLQkjVDwBX099Wy9NKQwTWihZdU5hWRIVe0AsQnQMXUF2Wi5MLl9DT3gOflQmHRdVMw'),
  _s('ofm_polskie_reggae', 'Polskie Reggae', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polskie-reggae'], 'https://v.wpimg.pl/Zjk1LmpwdQsKUzpeXwx4HkkLbgQZVXZIHhN2T19BaloTHiMdFRk8B0ZEPAEfFj5HCkElQwcHOQ4FHzwBX0VqCQpQeQ5JWjtdUglhWUZBYkcKCShcXU5uCVIHeglAQDxTXh8mHRdVJw'),
  _s('ofm_500_rnb_hits', '500 R\'n\'B Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=500-rnb-hits'], 'https://v.wpimg.pl/MGM3LmpwYiYsUTpeXwxvM28JbgQZVWFlOBF2T19BfXc1HCMdFRkrKmBGPAEfFilqLEMlQwcHLiMjHTwBXxF9dn5SeVQTWn4kfQRhWUEVf2ovBS9eXRR_I3wLfAlHTn0keh0mHRdVMA'),
  _s('ofm_smutne_piosenki', 'Smutno...', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=smutne-piosenki'], 'https://v.wpimg.pl/NWI5LmpwYTYoVzpeXwxsI2sPbgQZVWJ1PBd2T19BfmcxGiMdFRkoOmRAPAEfFip6KEUlQwcHLTMnGzwBXxJ7YypXfFwUWnxjeQxhWRFBKHpwAnkJXUB-bn0HdFhIFns1cBsmHRdVMw'),
  _s('ofm_smooth_jazz', 'Smooth Jazz', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=smooth-jazz'], 'https://v.wpimg.pl/ODI2LmpwYCUoUDpeXwxtMGsIbgQZVWNmPBB2T19Bf3QxHSMdFRkpKWRHPAEfFitpKEIlQwcHLCAnHDwBX0F5Ji1UdA5EWit8KwNhWUUWfmkoASlfXRYqICwLdF8SQnd2fxwmHRdVMg'),
  _s('ofm_po_polsku_80s_9', 'Po Polsku 80s &amp; 90s', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=po-polsku-80s-90s'], 'https://v.wpimg.pl/Y2JhLmpwdlMrCjpeXwx7RmhSbgQZVXUQP0p2T19BaQIyRyMdFRk_X2cdPAEfFj0fKxglQwcHOlYkRjwBXxVoV3paew5HWmkDf19hWUEVaR9yXHUMXRQ7US8KLQ5DFDpQK0YmHRdVJA'),
  _s('ofm_pozytywki', 'Pozytywki', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=pozytywki'], 'https://v.wpimg.pl/MWEwLmpwYjYkFTpeXwxvI2dNbgQZVWF1MFV2T19BfWc9WCMdFRkrOmgCPAEfFil6JAclQwcHLjMrWTwBX0cpZyBFfVREWnVhdURhWRVPf3p9Fn9VXRErMXMWeFRGRnw2dVkmHRdVMA'),
  _s('ofm_hygge', 'Kocyk', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=hygge'], 'https://v.wpimg.pl/MjgzLmpwYgsGGDpeXwxvHkVAbgQZVWFIElh2T19BfVofVSMdFRkrB0oPPAEfFilHBgolQwcHLg4JVDwBX0V4D1BJeVtJWnULVUlhWUJCdEcFG34JXUB1X1FCKA8VFX9SVFQmHRdVMA'),
  _s('ofm_piano_chill', 'Piano Chill', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=piano-chill'], 'https://v.wpimg.pl/Y2E2LmpwdlMkUDpeXwx7RmcIbgQZVXUQMBB2T19BaQI9HSMdFRk_X2hHPAEfFj0fJEIlQwcHOlYrHDwBX046BnFRLwsRWmsBJgVhWUcSah98AXlUXUJoVyNWLw9ERTpTcxwmHRdVJA'),
  _s('ofm_po_polsku_90', 'Po Polsku 90s', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=po-polsku-90'], 'https://v.wpimg.pl/OTE3LmpwYDUkUTpeXwxtIGcJbgQZVWN2MBF2T19Bf2Q9HCMdFRkpOWhGPAEfFit5JEMlQwcHLDArHTwBXxJ8YnVVL1VJWn5kJAZhWUZGfnknAC1bXUF_YiQBdV0SQ3Zlch0mHRdVMg'),
  _s('ofm_retro_cafe', 'Retro Cafe', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=retro-cafe'], 'https://v.wpimg.pl/OGJiLmpwYCYrCzpeXwxtM2hTbgQZVWNlP0t2T19Bf3cyRiMdFRkpKmccPAEfFitqKxklQwcHLCMkRzwBXxV6Ii4LKA5AWi4iL15hWRRHeWpyUXpdXU8tdy9fKAxARnclKEcmHRdVMg'),
  _s('ofm_500_reggae_hits', '500 Reggae Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=500-reggae-hits'], 'https://v.wpimg.pl/MDlhLmpwYiUNCjpeXwxvME5SbgQZVWFmGUp2T19BfXQURyMdFRkrKUEdPAEfFilpDRglQwcHLiACRjwBX0csJQ9cdFsVWn10DQ5hWUJDKGkOCihcXRN7dF1ddQtFR319DUYmHRdVMA'),
  _s('ofm_500_electronic_', '500 Electronic Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=500-electronic-hits'], 'https://v.wpimg.pl/N2E1LmpwYVMkUzpeXwxsRmcLbgQZVWIQMBN2T19BfgI9HiMdFRkoX2hEPAEfFiofJEElQwcHLVYrHzwBX095BXwFeQtEWn8EfQNhWUVCdx99CHlYXRF8AXcGLgxCFHlTcB8mHRdVMw'),
  _s('ofm_kolysanki', 'Kołysanki', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=kolysanki'], 'https://v.wpimg.pl/ZGNjLmpwdSYvCDpeXwx4M2xQbgQZVXZlO0h2T19Banc2RSMdFRk8KmMfPAEfFj5qLxolQwcHOSMgRDwBXxFqJXhYLVkVWjx3fQlhWUhHYmovC39aXU84dH1afg9AQj4kLUQmHRdVJw'),
  _s('ofm_work_vibes', 'Work Vibes', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=work-vibes'], 'https://v.wpimg.pl/NDZjLnBuYSU7CDpdbQ5sMHhQbgcrV2JmL0h2TG1DfnQiRSMeJxsoKXcfPAItFCppOxolQDUFLSA0RDwCbRF9cjtafFt3WH4lYghhWidMKGk7Wn0Kb0EvITtfdFsmRnpyOUQ8ACVXMw'),
  _s('ofm_muzyka_klasyczn', 'Relaks Przy Klasyce', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=muzyka-klasyczna'], 'https://v.wpimg.pl/NDk5LmpwYSUKVzpeXwxsMEkPbgQZVWJmHhd2T19BfnQTGiMdFRkoKUZAPAEfFippCkUlQwcHLSAFGzwBX0QtJ11RfA5GWisiWgRhWUIUd2kKUX5YXRR-Jw0EeFxIQHp9UhsmHRdVMw'),
  _s('ofm_relaks', 'Relaks', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=relaks'], 'https://v.wpimg.pl/Y2IzLmpwdlMoGDpeXwx7RmtAbgQZVXUQPFh2T19BaQIxVSMdFRk_X2QPPAEfFj0fKAolQwcHOlYnVDwBX09oUHgYfVtCWmgEfEJhWUNFYR8rGy5UXRZtVCofdAtITzpQelQmHRdVJA'),
  _s('ofm_classic_hits', 'Classic Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=classic-hits'], 'https://v.wpimg.pl/MDFlLmpwYiUnDjpeXwxvMGRWbgQZVWFmM052T19BfXQ-QyMdFRkrKWsZPAEfFilpJxwlQwcHLiAoQjwBXxMsdHZbL15JWighc1thWUkSfml_Wy5ZXU96IHUNfFoTTn11I0ImHRdVMA'),
  _s('ofm_muzyka_filmowa', 'Muzyka Filmowa', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=muzyka-filmowa'], 'https://v.wpimg.pl/NTdlLmpwYTUFDjpeXwxsIEZWbgQZVWJ2EU52T19BfmQcQyMdFRkoOUkZPAEfFip5BRwlQwcHLTAKQjwBX0R6YAINLg9IWn9tVV9hWUUULHldD3lUXUZ2bVdVfQgWFntjAUImHRdVMw'),
  _s('ofm_top_wszech_czas_1', 'Top Wszech Czasow - Rock PL', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=top-wszech-czasow-rock-pl'], 'https://v.wpimg.pl/MjdiLmpwYgsFCzpeXwxvHkZTbgQZVWFIEUt2T19BfVocRiMdFRkrB0kcPAEfFilHBRklQwcHLg4KRzwBXxJ7XlVbe1tEWn9aBllhWUQTe0dcXi5fXRV_WgZaewkURn9dBkcmHRdVMA'),
  _s('ofm_love', 'Love', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=love'], 'https://v.wpimg.pl/NTY1LmpwYTU4UzpeXwxsIHsLbgQZVWJ2LBN2T19BfmQhHiMdFRkoOXREPAEfFip5OEElQwcHLTA3HzwBX0AqNT0DdVVDWntsP1JhWUBOfXk7BC8JXRMoY2AGLl8TRHtibB8mHRdVMw'),
  _s('ofm_top_wszech_czas_2', 'Top Wszech Czasów - Rock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=top-wszech-czasow-rock'], 'https://v.wpimg.pl/M2E1LmpwYlMkUzpeXwxvRmcLbgQZVWEQMBN2T19BfQI9HiMdFRkrX2hEPAEfFikfJEElQwcHLlYrHzwBX0MvV3cFeAgRWisFJ1BhWRFAeR99A3paXRV0A3AFKlQUQn5TcB8mHRdVMA'),
  _s('ofm_dobry_wieczor', 'Dobry Wieczór', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=dobry-wieczor'], 'https://v.wpimg.pl/Njg3LmpwYQsGUTpeXwxsHkUJbgQZVWJIEhF2T19BflofHCMdFRkoB0pGPAEfFipHBkMlQwcHLQ4JHTwBX0N_DF4KKVpIWnkJVARhWUBHfUdfVnxaXU8rDwYLel5AFHhSUB0mHRdVMw'),
  _s('ofm_polskie_ballady', 'Polskie Ballady', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polskie-ballady'], 'https://v.wpimg.pl/YjY5Lmpwdgs4VzpeXwx7HnsPbgQZVXVILBd2T19BaVohGiMdFRk_B3RAPAEfFj1HOEUlQwcHOg43GzwBXxVgXztRKAxAWm4PbwNhWUVFOkc7BnQIXRRgX2sNeVVIFjtcYBsmHRdVJA'),
  _s('ofm_happy', 'Happy', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=happy'], 'https://v.wpimg.pl/NmRiLmpwYQwzCzpeXwxsGXBTbgQZVWJPJ0t2T19Bfl0qRiMdFRkoAH8cPAEfFipAMxklQwcHLQk8RzwBX0EvW2pRdFlBWnwMYgxhWUAWL0BqC39UXRJ_XmVbLggUT3gJMEcmHRdVMw'),
  _s('ofm_punk_rock', 'Punk Rock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=punk-rock'], 'https://v.wpimg.pl/MDdlLmpwYiUFDjpeXwxvMEZWbgQZVWFmEU52T19BfXQcQyMdFRkrKUkZPAEfFilpBRwlQwcHLiAKQjwBX0coJQEIKFxJWnxwUg1hWUJAeGkGXSldXUF7clQKKQwWFX1zAUImHRdVMA'),
  _s('ofm_do_auta_rock', 'Do Auta Rock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=do-auta-rock'], 'https://v.wpimg.pl/NTY5LmpwYTU4VzpeXwxsIHsPbgQZVWJ2LBd2T19BfmQhGiMdFRkoOXRAPAEfFip5OEUlQwcHLTA3GzwBX0QtZGlTdFlIWn42b1BhWUYVd3lgVHlUXUR8YmkELlsWT3tiYBsmHRdVMw'),
  _s('ofm_500_alternative', '500 Alternative Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=500-alternative-hits'], 'https://v.wpimg.pl/ODdlLmpwYCUFDjpeXwxtMEZWbgQZVWNmEU52T19Bf3QcQyMdFRkpKUkZPAEfFitpBRwlQwcHLCAKQjwBXxMqIVVVfQlGWnt9VlphWRQTe2ldWy0OXUF_dVQPKQhCTndzAUImHRdVMg'),
  _s('ofm_90s_rock', '90s Rock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=90s-rock'], 'https://v.wpimg.pl/ZWJlLmpwdTYrDjpeXwx4I2hWbgQZVXZ1P052T19BamcyQyMdFRk8OmcZPAEfFj56KxwlQwcHOTMkQjwBX0RpNCtUeVxFWjg1eQlhWUJEY3ooCH1UXURsZHkKdQtFET81L0ImHRdVJw'),
  _s('ofm_polska_rocks', 'Polska Rocks!', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polska-rocks'], 'https://v.wpimg.pl/YjVkLmpwdgs3CTpeXwx7HnRRbgQZVXVII0l2T19BaVouRCMdFRk_B3sePAEfFj1HNxslQwcHOg44RTwBXxFuUjNceVRAWjwPZFphWRNPbEdvUi1fXU5hUm9feAxEEjtfMkUmHRdVJA'),
  _s('ofm_we_dwoje', 'We Dwoje', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=we-dwoje'], 'https://v.wpimg.pl/MzE3LmpwYhskUTpeXwxvDmcJbgQZVWFYMBF2T19BfUo9HCMdFRkrF2hGPAEfFilXJEMlQwcHLh4rHTwBX0F1QnQDelUWWi4cfABhWUBCeld9Ci4LXUF9SHwFel9BQn5Lch0mHRdVMA'),
  _s('ofm_sexy_soul_rnb', 'Soul &amp; R\'n\'B Cafe', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=sexy-soul-rnb'], 'https://v.wpimg.pl/Nzg2LmpwYRsGUDpeXwxsDkUIbgQZVWJYEhB2T19BfkofHSMdFRkoF0pHPAEfFipXBkIlQwcHLR4JHDwBX0V4TQIHe11EWipMVQFhWUBDKlcGVnRbXRV8HgRQewsTTnlCURwmHRdVMw'),
  _s('ofm_chill_lofi_beat', 'Chill &amp; Lofi Beats', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=chill-lofi-beats'], 'https://v.wpimg.pl/ZmY3LmpwdQw4UTpeXwx4GXsJbgQZVXZPLBF2T19Bal0hHCMdFRk8AHRGPAEfFj5AOEMlQwcHOQk3HTwBXxI5CWlWew4RWmleblFhWRNOOEA4BH5bXU5sW2wKLgkRRTwLbh0mHRdVJw'),
  _s('ofm_bajki', 'Bajki', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=bajki'], 'https://v.wpimg.pl/MTdiLmpwYjUFCzpeXwxvIEZTbgQZVWF2EUt2T19BfWQcRiMdFRkrOUkcPAEfFil5BRklQwcHLjAKRzwBX0J7bF1ceV1AWi4yUQ1hWUlOdXkFCHlUXRR_NVwPeV5DE3xjBkcmHRdVMA'),
  _s('ofm_80s_chill', '80s Chill', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=80s-chill'], 'https://v.wpimg.pl/OThlLnBuYDUJDjpdbQ5tIEpWbgcrV2N2HU52TG1Df2QQQyMeJxspOUUZPAItFCt5CRwlQDUFLDAGQjwCbRR5ZFldKgghWCpkWwphWntEK3lQXC5Yb0J3Yw5eKQokRHZsDUI8ACVXMg'),
  _s('ofm_alt_cafe', 'Alt Cafe', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=alt-cafe'], 'https://v.wpimg.pl/NTk2LmpwYTUKUDpeXwxsIEkIbgQZVWJ2HhB2T19BfmQTHSMdFRkoOUZHPAEfFip5CkIlQwcHLTAFHDwBXxF3NVoBelVJWnxnWgFhWRRGK3kJUH1cXUZ8ZQgEeVxCT3ttXRwmHRdVMw'),
  _s('ofm_disco_polo_fres', 'Disco Polo Nowości 2026', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=disco-polo-freszzz'], 'https://v.wpimg.pl/YWM0LmpwdjYsUjpeXwx7I28KbgQZVXV1OBJ2T19BaWc1HyMdFRk_OmBFPAEfFj16LEAlQwcHOjMjHjwBX0M8ZikILVpDWm4yeAlhWRQRO3p0VH5aXRU4Y3RUeAwSFTg0eR4mHRdVJA'),
  _s('ofm_wesele', 'Wesele', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=wesele'], 'https://v.wpimg.pl/MjZmLmpwYgs7DzpeXwxvHnhXbgQZVWFIL092T19BfVoiQiMdFRkrB3cYPAEfFilHOx0lQwcHLg40QzwBX0R6WTkOeVxDWntfbAxhWUZOLkdiCHRcXRF-CzkIKlRARX9cPEMmHRdVMA'),
  _s('ofm_hip_hop_ulica', 'Hip-Hop Ulica', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=hip-hop-ulica'], 'https://v.wpimg.pl/MWMyLmpwYjYsGzpeXwxvI29DbgQZVWF1OFt2T19BfWc1ViMdFRkrOmAMPAEfFil6LAklQwcHLjMjVzwBX0IsY39LLllAWn1gKB9hWUJPfHosTHpVXRR-Y3gce18SQHw0f1cmHRdVMA'),
  _s('ofm_rocks', 'Rocks!', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=rocks'], 'https://v.wpimg.pl/YWYwLmpwdjY4FTpeXwx7I3tNbgQZVXV1LFV2T19BaWchWCMdFRk_OnQCPAEfFj16OAclQwcHOjM3WTwBXxE9M2sUeAtCWjxvaE9hWUMWanphT3xfXUQ8NG1BLwkWFDgxaVkmHRdVJA'),
  _s('ofm_classic_metal', 'Classic Metal', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=classic-metal'], 'https://v.wpimg.pl/ODY1LmpwYCU4UzpeXwxtMHsLbgQZVWNmLBN2T19Bf3QhHiMdFRkpKXREPAEfFitpOEElQwcHLCA3HzwBX054IDtTeFwWWnp2OlBhWRRPeWk7B3hfXRR7dmBVfgxDRndybB8mHRdVMg'),
  _s('ofm_piosenki_dla_dz', 'Piosenki dla dzieci', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=piosenki-dla-dzieci'], 'https://v.wpimg.pl/MjVhLmpwYgs3CjpeXwxvHnRSbgQZVWFII0p2T19BfVouRyMdFRkrB3sdPAEfFilHNxglQwcHLg44RjwBX0cuXDUJKlRDWi8LYV9hWUBCdEc3Wn8JXRF0CW4Je1RFEn9fN0YmHRdVMA'),
  _s('ofm_dobranoc', 'Dobranoc', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=dobranoc'], 'https://v.wpimg.pl/OWQ0LmpwYDYwUjpeXwxtI3MKbgQZVWN1JBJ2T19Bf2cpHyMdFRkpOnxFPAEfFit6MEAlQwcHLDM_HjwBX0V4Y2RRfFVFWnxnZFFhWRNEe3poBXQJXRYtMTUGeFwVE3YzZR4mHRdVMg'),
  _s('ofm_rock_ballady', 'Rock Ballady', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=rock-ballady'], 'https://v.wpimg.pl/NWNiLmpwYTYvCzpeXwxsI2xTbgQZVWJ1O0t2T19Bfmc2RiMdFRkoOmMcPAEfFip6LxklQwcHLTMgRzwBXxQoY35eLQtFWnY0KwxhWRROd3osWnsJXU55ZCsIL14SQXs0LEcmHRdVMw'),
  _s('ofm_top_wszech_czas_3', 'Top Wszech Czasów - Hip-Hop PL', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=top-wszech-czasow-hip-hop-pl'], 'https://v.wpimg.pl/ZTljLmpwdTUNCDpeXwx4IE5QbgQZVXZ2GUh2T19BamQURSMdFRk8OUEfPAEfFj55DRolQwcHOTACRDwBXxU8Zl1feghBWj5lCAlhWUQUbXkOWC8OXUA_MFQLLV4TRT9tD0QmHRdVJw'),
  _s('ofm_alt_classic', 'Alt Classic', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=alt-classic'], 'https://v.wpimg.pl/NDc4LmpwYSUCVjpeXwxsMEEObgQZVWJmFhZ2T19BfnQbGyMdFRkoKU5BPAEfFippAkQlQwcHLSANGjwBX0AvcQdSKlpGWn19BlVhWUFOfmlaAnVcXRItfVYCdQkRRnpzWxomHRdVMw'),
  _s('ofm_meloradio', 'Meloradio', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=meloradio'], 'https://v.wpimg.pl/ZjdmLnBudQsFDzpdbQ54HkZXbgcrV3ZIEU92TG1DalocQiMeJxs8B0kYPAItFD5HBR0lQDUFOQ4KQzwCbUBiXQBUfQh7WG4JVQ9hWndNbEdcXnpXbxdpX1EPfg1xFjxdAkM8ACVXJw'),
  _s('ofm_muzyka_do_snu', 'Muzyka Do Snu', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=muzyka-do-snu'], 'https://v.wpimg.pl/NGU0LmpwYSY0UjpeXwxsM3cKbgQZVWJlIBJ2T19BfnctHyMdFRkoKnhFPAEfFipqNEAlQwcHLSM7HjwBXxF3dWEAfVpEWihwNwRhWRRAfGptAXUOXREsJWEEegwTEnoiYR4mHRdVMw'),
  _s('ofm_top_wszech_czas_4', 'Top Wszech Czasów - Polska', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=top-wszech-czasow-polska'], 'https://v.wpimg.pl/ZmQ4LmpwdQwwVjpeXwx4GXMObgQZVXZPJBZ2T19Bal0pGyMdFRk8AHxBPAEfFj5AMEQlQwcHOQk_GjwBXxE7XDQBfVlGWm5aN1ZhWRRPbkAwBS4MXRZuCWgEeQkUQDwJaRomHRdVJw'),
  _s('ofm_ciezkie_brzmien', 'Ciężkie Brzmienia', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=ciezkie-brzmienia'], 'https://v.wpimg.pl/NjgzLmpwYQsGGDpeXwxsHkVAbgQZVWJIElh2T19BflofVSMdFRkoB0oPPAEfFipHBgolQwcHLQ4JVDwBXxIoXlFPf1tJWntaU0phWUMUfkcFTC5ZXUZ3XV4ZLVgSR3hSVFQmHRdVMw'),
  _s('ofm_american_rock', 'American Rock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=american-rock'], 'https://v.wpimg.pl/MmE2LmpwYgwkUDpeXwxvGWcIbgQZVWFPMBB2T19BfV09HSMdFRkrAGhHPAEfFilAJEIlQwcHLgkrHDwBXxYpXSQGeVRIWn0PJAthWRNFfEB9AC4PXRF9XnBRe10VTn8McxwmHRdVMA'),
  _s('ofm_trance', 'Trance', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=trance'], 'https://v.wpimg.pl/YzMwLmpwdhssFTpeXwx7Dm9NbgQZVXVYOFV2T19BaUo1WCMdFRk_F2ACPAEfFj1XLAclQwcHOh4jWTwBXxRsQ3kSeFgTWjscKxJhWRISald1Fn5UXUU4Qn1EKg4TFTpJfVkmHRdVJA'),
  _s('ofm_classic_rock', 'Classic Rock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=classic-rock'], 'https://v.wpimg.pl/YTg5LmpwdjUGVzpeXwx7IEUPbgQZVXV2Ehd2T19BaWQfGiMdFRk_OUpAPAEfFj15BkUlQwcHOjAJGzwBXxU8Z1ACL1QWWmA2VFRhWRRPankFAH4LXRQ9bFBTL18VFThsXhsmHRdVJA'),
  _s('ofm_alt_pl', 'Alt PL', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=alt-pl'], 'https://v.wpimg.pl/ZmE4LmpwdQwkVjpeXwx4GWcObgQZVXZPMBZ2T19Bal09GyMdFRk8AGhBPAEfFj5AJEQlQwcHOQkrGjwBX0ZsXnMBL1UTWmNUJwVhWUhAPEAkBHVdXU8_CXRWdV9DRDwMfRomHRdVJw'),
  _s('ofm_polski_rock', 'Polski Rock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polski-rock'], 'https://v.wpimg.pl/Mzc5LmpwYhsCVzpeXwxvDkEPbgQZVWFYFhd2T19BfUobGiMdFRkrF05APAEfFilXAkUlQwcHLh4NGzwBX0ArSAYAelkVWikZWg1hWUMTeVdaB3QIXUN4GAVXdVhHTn5NWhsmHRdVMA'),
  _s('ofm_acoustic_vibes', 'Akustyczne Hity', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=acoustic-vibes'], 'https://v.wpimg.pl/MTc5LmpwYjUCVzpeXwxvIEEPbgQZVWF2Fhd2T19BfWQbGiMdFRkrOU5APAEfFil5AkUlQwcHLjANGzwBXxZ7ZQcMfQkUWnVnVwRhWUIVKHlbBnVfXUUvMAUFKVhAFHxjWhsmHRdVMA'),
  _s('ofm_po_jednej_nutce', 'Po Jednej Nutce', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=po-jednej-nutce'], 'https://v.wpimg.pl/NTdkLmpwYTUFCTpeXwxsIEZRbgQZVWJ2EUl2T19BfmQcRCMdFRkoOUkePAEfFip5BRslQwcHLTAKRTwBXxJ9ZwIJflkUWi9tV1NhWRRAeXlcXykMXUZ9ZVwNeF9HE3tjAEUmHRdVMw'),
  _s('ofm_500_heavy_hits', '500 Heavy Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=500-heavy-hits'], 'https://v.wpimg.pl/MjlhLmpwYgsNCjpeXwxvHk5SbgQZVWFIGUp2T19BfVoURyMdFRkrB0EdPAEfFilHDRglQwcHLg4CRjwBX091D1sMdQwSWnsMWF5hWUZAekdVUHVYXREoCw0Oeg4TRH9TDUYmHRdVMA'),
  _s('ofm_muzyka_motywacy', 'Hip-Hop Motywacyjny', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=muzyka-motywacyjna'], 'https://v.wpimg.pl/Y2EyLmpwdlMkGzpeXwx7RmdDbgQZVXUQMFt2T19BaQI9ViMdFRk_X2gMPAEfFj0fJAklQwcHOlYrVzwBXxVvBHUYfV9HWmwHcEhhWRVEOh99GikOXRJtVyNIKF5CTjpTd1cmHRdVJA'),
  _s('ofm_dzien_dobry', 'Dzień Dobry!', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=dzien-dobry'], 'https://v.wpimg.pl/NTI3LmpwYTUoUTpeXwxsIGsJbgQZVWJ2PBF2T19BfmQxHCMdFRkoOWRGPAEfFip5KEMlQwcHLTAnHTwBXxQsMXgAL1pEWnY3KgRhWUlGeXkoVS5bXUd_ZX8EeAlCRHtmfh0mHRdVMw'),
  _s('ofm_summerfreszzz', 'Hity: Wiosna 2026', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=summerfreszzz'], 'https://v.wpimg.pl/M2IwLmpwYlMoFTpeXwxvRmtNbgQZVWEQPFV2T19BfQIxWCMdFRkrX2QCPAEfFikfKAclQwcHLlYnWTwBX0QuBXgReF9GWi5UcE9hWRZPfh8oFHhaXU8pVn9Pf1hIQX5QeVkmHRdVMA'),
  _s('ofm_szum_do_snu', 'Szum', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=szum-do-snu'], 'https://v.wpimg.pl/MjY5LmpwYgs4VzpeXwxvHnsPbgQZVWFILBd2T19BfVohGiMdFRkrB3RAPAEfFilHOEUlQwcHLg43GzwBXxR6C20AeVwSWi4IYVFhWRZDL0c7BChdXRR7CzgAfAsVFX9cYBsmHRdVMA'),
  _s('ofm_hity_na_caly_dz', 'Hity Na Cały Dzień', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=hity-na-caly-dzien'], 'https://v.wpimg.pl/MWYyLmpwYjY4GzpeXwxvI3tDbgQZVWF1LFt2T19BfWchViMdFRkrOnQMPAEfFil6OAklQwcHLjM3VzwBX0YsYDpKfQ8VWnU0a0thWRZOeXpgTXpbXRR1NmBOKFxAFHwxa1cmHRdVMA'),
  _s('ofm_slonce', 'Słońce!', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=slonce'], 'https://v.wpimg.pl/Yzc3LmpwdhsCUTpeXwx7DkEJbgQZVXVYFhF2T19BaUobHCMdFRk_F05GPAEfFj1XAkMlQwcHOh4NHTwBXxRgGQELfggUWjhKUwRhWUESalcCACgMXRZtHwYEL19JETpNVB0mHRdVJA'),
  _s('ofm_radio_zlote_prz', 'Radio Złote Przeboje', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-zlote-przeboje'], 'https://v.wpimg.pl/MGVmLnBuYiY3DzpdbQ5vM3RXbgcrV2FlI092TG1DfXcuQiMeJxsrKnsYPAItFClqNx0lQDUFLiM4QzwCbRZ9dGALf1YjWHl1NFphWiAXdGo3Wy5Ybxd7fjcIe1hyFH0iMEM8ACVXMA'),
  _s('ofm_spokojne_po_pol', 'Spokojne Po Polsku', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=spokojne-po-polsku'], 'https://v.wpimg.pl/ZTExLmpwdTUkGjpeXwx4IGdCbgQZVXZ2MFp2T19BamQ9VyMdFRk8OWgNPAEfFj55JAglQwcHOTArVjwBXxE8N3EeKF9BWj5sdx5hWUJBY3knHn1YXU9iY3dBKFxDQj9ldFYmHRdVJw'),
  _s('ofm_500_rock_hits', '1001 Rock Hits', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=500-rock-hits'], 'https://v.wpimg.pl/MGJjLmpwYiYrCDpeXwxvM2hQbgQZVWFlP0h2T19BfXcyRSMdFRkrKmcfPAEfFilqKxolQwcHLiMkRDwBXxEoIi9fL11JWi8leFhhWRQWKWpyX3hdXUArfytdKA9AQn0lKUQmHRdVMA'),
  _s('ofm_najwieksze_prze', 'Największe Przeboje XX w.', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=najwieksze-przeboje-xx-w'], 'https://v.wpimg.pl/ODUyLmpwYCU0GzpeXwxtMHdDbgQZVWNmIFt2T19Bf3QtViMdFRkpKXgMPAEfFitpNAklQwcHLCA7VzwBX0IqImIae1RCWit3YhxhWRMVeGltSn1eXUB2fWMdLVgREndxZ1cmHRdVMg'),
  _s('ofm_hity_bez_konca', 'Hity Bez Końca', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=hity-bez-konca'], 'https://v.wpimg.pl/ZDYyLmpwdSU4GzpeXwx4MHtDbgQZVXZmLFt2T19BanQhViMdFRk8KXQMPAEfFj5pOAklQwcHOSA3VzwBXxFiITwbKA9EWmtxbEFhWUdGOWlhQHlcXU9qIWsYfQtHQz5ya1cmHRdVJw'),
  _s('ofm_legendy_bluesa', 'Legendy Bluesa', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=legendy-bluesa'], 'https://v.wpimg.pl/YTQ0LmpwdjUwUjpeXwx7IHMKbgQZVXV2JBJ2T19BaWQpHyMdFRk_OXxFPAEfFj15MEAlQwcHOjA_HjwBX0I_ZGEAKl1CWmE2aAJhWUQUOnlpVilUXU87N2JULlgRTjhgZR4mHRdVJA'),
  _s('ofm_ladies_cafe', 'Ladies Cafe', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=ladies-cafe'], 'https://v.wpimg.pl/MDE2LmpwYiUkUDpeXwxvMGcIbgQZVWFmMBB2T19BfXQ9HSMdFRkrKWhHPAEfFilpJEIlQwcHLiArHDwBX0R6dXVULg8TWix0IwZhWUdDfGl8UyhUXRV4IiFRdFxCQn11cxwmHRdVMA'),
  _s('ofm_przeboje_na_cal', 'Przeboje Na Cały Dzień', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=przeboje-na-caly-dzien'], 'https://v.wpimg.pl/ZjU5LmpwdQs0VzpeXwx4HncPbgQZVXZIIBd2T19BalotGiMdFRk8B3hAPAEfFj5HNEUlQwcHOQ47GzwBXxE5X2cFfV9EWmxcYgNhWRJGY0dsAXtbXUA4CzZTel9EFDxfbBsmHRdVJw'),
  _s('ofm_crema_cafe', 'Crema Cafe', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=crema-cafe'], 'https://v.wpimg.pl/YjJkLmpwdgsrCTpeXwx7HmhRbgQZVXVIP0l2T19BaVoyRCMdFRk_B2cePAEfFj1HKxslQwcHOg4kRTwBX0Y_CXgNLl8RWmkJKAlhWRNPPEcoUioMXRJsCy9deAtHEztYLkUmHRdVJA'),
  _s('ofm_the_best_of_pro', 'The Best Of Prog Rock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=the-best-of-prog-rock'], 'https://v.wpimg.pl/ZDY2LmpwdSU4UDpeXwx4MHsIbgQZVXZmLBB2T19BanQhHSMdFRk8KXRHPAEfFj5pOEIlQwcHOSA3HDwBX0E-dG1TfVgSWjggbVFhWUdOPGk7CngJXUBjcGhXe1QRQD5ybxwmHRdVJw'),
  _s('ofm_praca_chill', 'Praca Chill', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=praca-chill'], 'https://v.wpimg.pl/ODU0LmpwYCU0UjpeXwxtMHcKbgQZVWNmIBJ2T19Bf3QtHyMdFRkpKXhFPAEfFitpNEAlQwcHLCA7HjwBX0cscGxUdF0VWisgZAFhWRMULWk0CXQLXREpdmZWKlhAR3dxYR4mHRdVMg'),
  _s('ofm_giganci_rocka', 'Giganci Rocka', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=giganci-rocka'], 'https://v.wpimg.pl/ZmMyLmpwdQwsGzpeXwx4GW9DbgQZVXZPOFt2T19Bal01ViMdFRk8AGAMPAEfFj5ALAklQwcHOQkjVzwBX0I8XntOeF9IWj9bfh1hWRFPbUB0HC5YXURtXy4deAgVQjwOf1cmHRdVJw'),
  _s('ofm_polski_rock_cla', 'Polski Rock Classic', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polski-rock-classic'], 'https://v.wpimg.pl/MjRhLmpwYgszCjpeXwxvHnBSbgQZVWFIJ0p2T19BfVoqRyMdFRkrB38dPAEfFilHMxglQwcHLg48RjwBX0N-WzMKKAlHWilaYQxhWUgRfUdqXn1bXRMvWmJcLwwURX9eM0YmHRdVMA'),
  _s('ofm_vox_fm', 'VOX FM', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=vox-fm'], 'https://v.wpimg.pl/Mzg1LmpwYhsGUzpeXwxvDkULbgQZVWFYEhN2T19BfUofHiMdFRkrF0pEPAEfFilXBkElQwcHLh4JHzwBXxN7HFQCdQlDWi4eUgVhWRQVeFcFBn5aXUN6T1QAe18VFH5CUh8mHRdVMA'),
  _s('ofm_chillout', 'Chillout', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=chillout'], 'https://v.wpimg.pl/MzZmLmpwYhs7DzpeXwxvDnhXbgQZVWFYL092T19BfUoiQiMdFRkrF3cYPAEfFilXOx0lQwcHLh40QzwBX090HGgLKl9EWnwcPFVhWUMWLldiD3sLXUYuQzxeL1VCT35MPEMmHRdVMA'),
  _s('ofm_radio_zet', 'Radio ZET', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-zet'], 'https://v.wpimg.pl/OTBjLmpwYDUjCDpeXwxtIGBQbgQZVWN2N0h2T19Bf2Q6RSMdFRkpOW8fPAEfFit5IxolQwcHLDAsRDwBX0csYXRTLVRJWn9nel5hWRVGfXkjCS5eXRN8YHZZe1UUEnZkIUQmHRdVMg'),
  _s('ofm_radio_tok_fm', 'Radio Tok FM', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-tok-fm'], 'https://v.wpimg.pl/MjJlLnBuYgsrDjpdbQ5vHmhWbgcrV2FIP052TG1DfVoyQyMeJxsrB2cZPAItFClHKxwlQDUFLg4kQjwCbUUuD3NZKFZ3WHlacw9hWndDdUdzVHUMbxMuCXlcKQtwF39YL0I8ACVXMA'),
  _s('ofm_rmf24', 'RMF24', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=rmf24'], 'https://v.wpimg.pl/ZmQ0LmpwdQwwUjpeXwx4GXMKbgQZVXZPJBJ2T19Bal0pHyMdFRk8AHxFPAEfFj5AMEAlQwcHOQk_HjwBXxU_C2kBewtDWm5VNQlhWUZGb0AwCSoJXUBjCWRSeAgVQDwJZR4mHRdVJw'),
  _s('ofm_radio_centrum_l', 'Radio Centrum (Lublin)', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-centrum-lublin'], 'https://v.wpimg.pl/N2U3LmpwYVM0UTpeXwxsRncJbgQZVWIQIBF2T19BfgItHCMdFRkoX3hGPAEfFiofNEMlQwcHLVY7HTwBX0Z9UGYDKFQSWnsBMABhWUgTeh83BnhVXUEsUWALeFtDFnlXYh0mHRdVMw'),
  _s('ofm_polskie_radio_k', 'Polskie Radio Kierowców', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polskie-radio-kierowcow'], 'https://v.wpimg.pl/NGI1LnBuYSYoUzpdbQ5sM2sLbgcrV2JlPBN2TG1DfncxHiMeJxsoKmREPAItFCpqKEElQDUFLSMnHzwCbRF-dXlXKA91WHt2KwdhWnVCK2orVy9cb0wvIXgDeVpwEHolfB88ACVXMw'),
  _s('ofm_fajne_radio', 'Fajne Radio', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=fajne-radio'], 'https://v.wpimg.pl/MWMzLmpwYjYsGDpeXwxvI29AbgQZVWF1OFh2T19BfWc1VSMdFRkrOmAPPAEfFil6LAolQwcHLjMjVDwBXxN0Y39If19CWntif0NhWRUTdXp0Ti8OXUJ_bnwZeA9HQXw0flQmHRdVMA'),
  _s('ofm_radio_nowy_swia', 'Radio Nowy Świat', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-nowy-swiat'], 'https://v.wpimg.pl/MTIxLmpwYjUoGjpeXwxvIGtCbgQZVWF2PFp2T19BfWQxVyMdFRkrOWQNPAEfFil5KAglQwcHLjAnVjwBXxQoMnFBfwlBWnhgfEBhWUdPfHlwHHhbXRN_MipAdVsWTnxmeFYmHRdVMA'),
  _s('ofm_antyradio', 'Antyradio', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=antyradio'], 'https://v.wpimg.pl/YjQ0LmpwdgswUjpeXwx7HnMKbgQZVXVIJBJ2T19BaVopHyMdFRk_B3xFPAEfFj1HMEAlQwcHOg4_HjwBXxFhXGVTdV5FWm0PMwZhWURDPUdpCXlUXUBqW2YJL1lDQDteZR4mHRdVJA'),
  _s('ofm_radio_fest', 'Radio Fest', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-fest'], 'https://v.wpimg.pl/YmYzLnBudgw4GDpdbQ57GXtAbgcrV3VPLFh2TG1DaV0hVSMeJxs_AHQPPAItFD1AOAolQDUFOgk3VDwCbRY8WmkbdV8mWGgIbhxhWnITP0BgHC0LbxRrWD0fflpzTDsLalQ8ACVXJA'),
  _s('ofm_radio_kolor', 'Radio Kolor', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-kolor'], 'https://v.wpimg.pl/MGZjLmpwYiY7CDpeXwxvM3hQbgQZVWFlL0h2T19BfXciRSMdFRkrKncfPAEfFilqOxolQwcHLiM0RDwBX0IscG9SdVsSWishYlNhWUROLmpiUnhcXRIodGtbflhIEX0hOUQmHRdVMA'),
  _s('ofm_radio_kampus', 'Radio Kampus', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-kampus'], 'https://v.wpimg.pl/ODZkLmpwYCU7CTpeXwxtMHhRbgQZVWNmL0l2T19Bf3QiRCMdFRkpKXcePAEfFitpOxslQwcHLCA0RTwBXxR3dWxfKQlGWi0mYg1hWUZBK2k4DSoIXUMpJjhfeQgTQndyPkUmHRdVMg'),
  _s('ofm_czworka_polskie', 'Czwórka', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=czworka-polskie-radio'], 'https://v.wpimg.pl/YTNkLnBudjUvCTpdbQ57IGxRbgcrV3V2O0l2TG1DaWQ2RCMeJxs_OWMePAItFD15LxslQDUFOjAgRTwCbUBqZn4KdAggWGFjfg9hWiAWaHl3CX9WbxZtYihefldzTThnKkU8ACVXJA'),
  _s('ofm_radio_357', 'Radio 357', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-357'], 'https://v.wpimg.pl/ZDc5LmpwdSUCVzpeXwx4MEEPbgQZVXZmFhd2T19BanQbGiMdFRk8KU5APAEfFj5pAkUlQwcHOSANGzwBX0E4fFAMfglGWmpzVgVhWRNAb2laU3RaXUVpfAIBegsVRz5zWhsmHRdVJw'),
  _s('ofm_polskie_radio_2', 'Polskie Radio 24', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polskie-radio-24'], 'https://v.wpimg.pl/YTA3LnBudjUgUTpdbQ57IGMJbgcrV3V2NBF2TG1DaWQ5HCMeJxs_OWxGPAItFD15IEMlQDUFOjAvHTwCbU1rbSUALlomWGhjcwthWiRMYXl4AC8Kb0FhZnkGfg1xTDhkdh08ACVXJA'),
  _s('ofm_radio_afera', 'Radio Afera', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-afera'], 'https://v.wpimg.pl/NGQ2LmpwYSYwUDpeXwxsM3MIbgQZVWJlJBB2T19BfncpHSMdFRkoKnxHPAEfFipqMEIlQwcHLSM_HDwBX0J6cmQCKgxCWi0jZARhWUlCeGowV3hdXUB6I2MKeVRBFXojZxwmHRdVMw'),
  _s('ofm_chillizet', 'Chillizet', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=chillizet'], 'https://v.wpimg.pl/NmY1LmpwYQw4UzpeXwxsGXsLbgQZVWJPLBN2T19Bfl0hHiMdFRkoAHREPAEfFipAOEElQwcHLQk3HzwBX08qWD8CdFwVWi9ZPAFhWUMTd0BhUnUMXUF8WjxVdFwUFngLbB8mHRdVMw'),
  _s('ofm_polskie_radio_d', 'Polskie Radio Dzieciom', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polskie-radio-dzieciom'], 'https://v.wpimg.pl/NzY3LnBuYRs4UTpdbQ5sDnsJbgcrV2JYLBF2TG1DfkohHCMeJxsoF3RGPAItFCpXOEMlQDUFLR43HTwCbUEqHmxWKA90WHlIOwZhWiMXLFc4By1eb0V3STpWfF4jQnlMbh08ACVXMw'),
  _s('ofm_polskie_radio_d_1', 'Polskie Radio dla Zagranicy', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polskie-radio-dla-zagranicy'], 'https://v.wpimg.pl/NjQ3LnBuYQswUTpdbQ5sHnMJbgcrV2JIJBF2TG1DflopHCMeJxsoB3xGPAItFCpHMEMlQDUFLQ4_HTwCbRF2C2ZWf1ojWHdcZAJhWnZAKEdoCilZbxZ2C2QLfQ91TXheZh08ACVXMw'),
  _s('ofm_radio_pogoda', 'Radio Pogoda', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-pogoda'], 'https://v.wpimg.pl/NmRkLmpwYQwzCTpeXwxsGXBRbgQZVWJPJ0l2T19Bfl0qRCMdFRkoAH8ePAEfFipAMxslQwcHLQk8RTwBXxF8VDdafVoVWn5cZghhWRJDdkAwCildXUYqWzEPdA5EEngJNkUmHRdVMw'),
  _s('ofm_rock_radio', 'Rock Radio', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=rock-radio'], 'https://v.wpimg.pl/OTIyLmpwYDUoGzpeXwxtIGtDbgQZVWN2PFt2T19Bf2QxViMdFRkpOWQMPAEfFit5KAklQwcHLDAnVzwBXxF9ZHBOeAtIWillKBhhWUVHLHkrGn5YXRF6bSscLVRAFnZme1cmHRdVMg'),
  _s('ofm_rmf_classic', 'RMF Classic', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=rmf-classic'], 'https://v.wpimg.pl/NDBlLmpwYSUjDjpeXwxsMGBWbgQZVWJmN052T19BfnQ6QyMdFRkoKW8ZPAEfFippIxwlQwcHLSAsQjwBX0F2cCNceV9GWipyJg1hWREUfWl7CHpeXU8tISAPfFUTRnp0J0ImHRdVMw'),
  _s('ofm_akademickie_rad', 'Akademickie Radio Luz', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=akademickie-radio-luz'], 'https://v.wpimg.pl/ZTE4LmpwdTUkVjpeXwx4IGcObgQZVXZ2MBZ2T19BamQ9GyMdFRk8OWhBPAEfFj55JEQlQwcHOTArGjwBX0ZiMCQAe10UWmlgd1dhWUAVPHl8DH8IXUdvYH1VfQ8RET9lfRomHRdVJw'),
  _s('ofm_polish_radio_lo', 'Polish Radio London', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polish-radio-london'], 'https://v.wpimg.pl/MWY1LnBuYjY4UzpdbQ5vI3sLbgcrV2F1LBN2TG1DfWchHiMeJxsrOnREPAItFCl6OEElQDUFLjM3HzwCbUcuY2kBKQohWHRmblBhWnsQLnpgAHkKb0IsZWoHKA8kQ3wxbB88ACVXMA'),
  _s('ofm_deszcz', 'Deszcz', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=deszcz'], 'https://v.wpimg.pl/N2QyLmpwYVMwGzpeXwxsRnNDbgQZVWIQJFt2T19BfgIpViMdFRkoX3wMPAEfFiofMAklQwcHLVY_VzwBX0d3BGBJKV9FWnxTYBphWUMWLB9pGHoOXUR5UWNIKlRIEnlWY1cmHRdVMw'),
  _s('ofm_radio_chopin', 'Radio Chopin', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-chopin'], 'https://v.wpimg.pl/MjUyLnBuYgs0GzpdbQ5vHndDbgcrV2FIIFt2TG1DfVotViMeJxsrB3gMPAItFClHNAklQDUFLg47VzwCbUV6WzAde18hWHhcZxphWntNfEc0TS1Zb0YpWTdIfAsnTH9fZ1c8ACVXMA'),
  _s('ofm_polskie_radio_d_2', 'Polskie Radio dla Ukrainy', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=polskie-radio-dla-ukrainy'], 'https://v.wpimg.pl/ZTNkLnBudTUvCTpdbQ54IGxRbgcrV3Z2O0l2TG1DamQ2RCMeJxs8OWMePAItFD55LxslQDUFOTAgRTwCbUBtMHdfKQ8kWG1sKA9hWnJBbnksXn5Xb0FrMHlaKQ1wQD9nKkU8ACVXJw'),
  _s('ofm_radio_rockserwi', 'Radio Rockserwis FM', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-rockserwis-fm'], 'https://v.wpimg.pl/OTM0LmpwYDUsUjpeXwxtIG8KbgQZVWN2OBJ2T19Bf2Q1HyMdFRkpOWBFPAEfFit5LEAlQwcHLDAjHjwBX0UrYCwAfFRHWn02elFhWUARLnl1AHhaXRItbXQCe1hCRHZneR4mHRdVMg'),
  _s('ofm_radio_akadera', 'Radio Akadera', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-akadera'], 'https://v.wpimg.pl/YzAzLmpwdhsgGDpeXwx7DmNAbgQZVXVYNFh2T19BaUo5VSMdFRk_F2wPPAEfFj1XIAolQwcHOh4vVDwBX05sTnAcdFxGWj0ecxthWUQTO1d4GykOXRU_QidIf1VIRTpKclQmHRdVJA'),
  _s('ofm_radio_piekary', 'Radio Piekary', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-piekary'], 'https://v.wpimg.pl/MzU2LnBuYhs0UDpdbQ5vDncIbgcrV2FYIBB2TG1DfUotHSMeJxsrF3hHPAItFClXNEIlQDUFLh47HDwCbRcvSGwGdF5xWHscYAZhWiZNelc3B3tbb0MvTWwAelhzR35PYxw8ACVXMA'),
  _s('ofm_eska2', 'ESKA2', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=eska2'], 'https://v.wpimg.pl/MmRiLmpwYgwzCzpeXwxvGXBTbgQZVWFPJ0t2T19BfV0qRiMdFRkrAH8cPAEfFilAMxklQwcHLgk8RzwBXxEvWGpcewhHWntUa1thWUFCdEAzUXRbXUEpW2BaLglHR38JMEcmHRdVMA'),
  _s('ofm_muzyka_na_dobry', 'Muzyka na dobry dzień', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=muzyka-na-dobry-dzien'], 'https://v.wpimg.pl/OGEzLmpwYCYkGDpeXwxtM2dAbgQZVWNlMFh2T19Bf3c9VSMdFRkpKmgPPAEfFitqJAolQwcHLCMrVDwBX08tIXZOKlhIWn50dEthWUJAeGp8H3oJXRMqIycZflpAFncmdlQmHRdVMg'),
  _s('ofm_eskarock', 'EskaRock', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=eskarock'], 'https://v.wpimg.pl/ZTJlLmpwdTUrDjpeXwx4IGhWbgQZVXZ2P052T19BamQyQyMdFRk8OWcZPAEfFj55KxwlQwcHOTAkQjwBX0VrYHwJeltJWjllKV1hWUISbXlzCX4OXU84NyxUeVUTQD9mL0ImHRdVJw'),
  _s('ofm_mistrzowie_gita', 'Mistrzowie Gitary', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=mistrzowie-gitary'], 'https://v.wpimg.pl/NGEyLmpwYSYkGzpeXwxsM2dDbgQZVWJlMFt2T19Bfnc9ViMdFRkoKmgMPAEfFipqJAklQwcHLSMrVzwBX0N6IidMf1UWWipyIUBhWUVDKGp9HShfXU9-ciRBdAgSRHomd1cmHRdVMw'),
  _s('ofm_ognisko', 'Ognisko', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=ognisko'], 'https://v.wpimg.pl/YzA1LmpwdhsgUzpeXwx7DmMLbgQZVXVYNBN2T19BaUo5HiMdFRk_F2xEPAEfFj1XIEElQwcHOh4vHzwBX0NrSnYEeF5BWm0YcwVhWUJOa1d5AnReXRM9SHlVKVgURzpKdB8mHRdVJA'),
  _s('ofm_szum_morza', 'Szum morza', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=szum-morza'], 'https://v.wpimg.pl/MWY3LmpwYjY4UTpeXwxvI3sJbgQZVWF1LBF2T19BfWchHCMdFRkrOnRGPAEfFil6OEMlQwcHLjM3HTwBX0J4bjwLKlVHWi5vagBhWRJPfHo4UHVfXRR5bj0EdAxAEXwxbh0mHRdVMA'),
  _s('ofm_spiew_ptakow', 'Śpiew ptaków', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=spiew-ptakow'], 'https://v.wpimg.pl/MDBhLmpwYiUjCjpeXwxvMGBSbgQZVWFmN0p2T19BfXQ6RyMdFRkrKW8dPAEfFilpIxglQwcHLiAsRjwBXxV7c3FcLVtAWil3IAphWRVHK2l6WSoLXU4sJyBYflwWFX10I0YmHRdVMA'),
  _s('ofm_odglosy_natury_', 'Odgłosy natury', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=odglosy-natury-do-snu'], 'https://v.wpimg.pl/MWFjLmpwYjYnCDpeXwxvI2RQbgQZVWF1M0h2T19BfWc-RSMdFRkrOmsfPAEfFil6JxolQwcHLjMoRDwBX04uYSUOKAlGWi9hflJhWRRHK3okXSheXRMrZXcLdVlIR3w2JUQmHRdVMA'),
  _s('ofm_radiowroclawkul', 'Radio Wrocław Kultura', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radiowroclawkultura'], 'https://v.wpimg.pl/NDJmLmpwYSUrDzpeXwxsMGhXbgQZVWJmP092T19BfnQyQiMdFRkoKWcYPAEfFippKx0lQwcHLSAkQzwBX0AtdC9afV9JWnt1clhhWUBEfmkrWHULXRMtJXkMe15GFnp2LEMmHRdVMw'),
  _s('ofm_idzie_burza', 'Idzie burza', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=idzie-burza'], 'https://v.wpimg.pl/NzQ5LmpwYRswVzpeXwxsDnMPbgQZVWJYJBd2T19BfkopGiMdFRkoF3xAPAEfFipXMEUlQwcHLR4_GzwBXxZ2STcMelxBWipIZFNhWUlPKldoAigOXUR2G2lUeFhHFHlOaBsmHRdVMw'),
  _s('ofm_radiowroclaw', 'Radio Wrocław', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radiowroclaw'], 'https://v.wpimg.pl/MzBmLnBuYhsjDzpdbQ5vDmBXbgcrV2FYN092TG1DfUo6QiMeJxsrF28YPAItFClXIx0lQDUFLh4sQzwCbRErHHoPe1h0WHRNc1lhWnZHfVd7DHVYb0d0HnAMKlZ0RX5KJEM8ACVXMA'),
  _s('ofm_radioram', 'Radio RAM', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radioram'], 'https://v.wpimg.pl/YWJhLmpwdjYrCjpeXwx7I2hSbgQZVXV1P0p2T19BaWcyRyMdFRk_OmcdPAEfFj16KxglQwcHOjMkRjwBX09hZX4LdV8WWmg0cglhWRZGOnpzCSlfXRY7NnMKLl5AEjg1K0YmHRdVJA'),
  _s('ofm_radio_krakow', 'Radio Kraków', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-krakow'], 'https://v.wpimg.pl/ZmYwLmpwdQw4FTpeXwx4GXtNbgQZVXZPLFV2T19Bal0hWCMdFRk8AHQCPAEfFj5AOAclQwcHOQk3WTwBXxZiX29FelVJWm4JbkdhWURAPEBgRHQJXU45X2oSeQsTRzwLaVkmHRdVJw'),
  _s('ofm_radio_krakow_ku', 'Radio Kraków Kultura', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=radio-krakow-kultura'], 'https://v.wpimg.pl/NmNlLmpwYQwvDjpeXwxsGWxWbgQZVWJPO052T19Bfl02QyMdFRkoAGMZPAEfFipALxwlQwcHLQkgQjwBX0N-D3tUeFlIWn0JfAhhWUlBfUAsWn1dXUR3XCtbfQtHRngOK0ImHRdVMw'),
  _s('ofm_same_przeboje', 'Same Przeboje', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=same-przeboje'], 'https://v.wpimg.pl/Zjg3LmpwdQsGUTpeXwx4HkUJbgQZVXZIEhF2T19BalofHCMdFRk8B0pGPAEfFj5HBkMlQwcHOQ4JHTwBX0VsXlQHeVhEWjgOAwVhWRYTPkcFB3RcXRZuXQVSKlVHEzxSUB0mHRdVJw'),
  _s('ofm_off_radio_krako', 'Off Radio Kraków', 'openfm', 128, ['https://getradio.reconv.pl/openfm?s=off-radio-krakow'], 'https://v.wpimg.pl/MDNmLmpwYiUvDzpeXwxvMGxXbgQZVWFmO092T19BfXQ2QiMdFRkrKWMYPAEfFilpLx0lQwcHLiAgQzwBX0Z5cnoML1sWWn0ieVVhWUUULml2Wi4PXRN5JStefAhARX13KEMmHRdVMA'),
  // ─── Alternatywy Open FM (Sieć RMF ON) ──────────────────────────────────
  _s('rmf_praca',    'RMF w Pracy',             'pop,hits',            128, ['https://rs9-krk2-cyfronet.rmfstream.pl/rmf_w_pracy'], ''),
  _s('rmf_impreza',  'RMF Party (Impreza)',     'dance,electronic,hits', 128, ['https://rs9-krk2-cyfronet.rmfstream.pl/rmf_party'], ''),
  _s('rmf_80s',      'RMF 80s',                 'retro,80s',           128, ['https://rs9-krk2-cyfronet.rmfstream.pl/rmf_80s'], ''),
  _s('rmf_90s',      'RMF 90s',                 'retro,90s',           128, ['https://rs9-krk2-cyfronet.rmfstream.pl/rmf_90s'], ''),
  _s('rmf_hiphop',   'RMF Hip Hop',             'hip-hop,rap',         128, ['https://rs9-krk2-cyfronet.rmfstream.pl/rmf_hip_hop'], ''),
  _s('eska_rap',     'Eska RAP / TRAP',         'hip-hop,rap,trap',    128, ['https://ic2.smcdn.pl/6240-1.aac', 'https://ic1.smcdn.pl/6240-1.aac'], 'https://www.eska.pl/favicon.ico'),
  _s('rmf_rock',     'RMF Polski Rock',         'rock,polskie',        128, ['https://rs9-krk2-cyfronet.rmfstream.pl/rmf_polski_rock'], ''),
  _s('rmf_poplista', 'RMF Poplista (Top)',      'pop,hits',            128, ['https://rs9-krk2-cyfronet.rmfstream.pl/rmf_poplista'], ''),
  _s('rmf_love',     'RMF Love (Spokojne)',     'chillout,ballads',    128, ['https://rs9-krk2-cyfronet.rmfstream.pl/rmf_love'], ''),
  _s('rmfclassic',   'RMF Classic',             'classical',           48,  ['https://rs103-krk-cyfronet.rmfstream.pl/rmf_classic','https://rs9-krk2.rmfstream.pl/rmf_classic'], 'https://www.rmfclassic.pl/favicon.ico'),
  _s('rmfmaxxx',     'RMF MAXXX',               'dance,electronic',    48,  ['https://rs9-krk2-cyfronet.rmfstream.pl/RMFMAXXX48','https://rs101-krk.rmfstream.pl/RMFMAXXX48'], ''),
]

const GENRES = [
  { id: 'all',       label: '🌐 Wszystkie' },
  { id: 'pop',       label: '🎵 Pop',        tags: ['pop', 'hits'] },
  { id: 'hiphop',    label: '🎤 Hip-Hop',    tags: ['hip-hop', 'rap', 'trap', 'hiphop'] },
  { id: 'electronic',label: '⚡ Electronic', tags: ['electronic', 'dance', 'edm', 'techno', 'house', 'clubbing'] },
  { id: 'rock',      label: '🎸 Rock',       tags: ['rock', 'alternative', 'metal'] },
  { id: 'chill',     label: '🌙 Chill',      tags: ['chillout', 'ambient', 'jazz', 'classical', 'ballads'] },
  { id: 'retro',     label: '📼 Retro',      tags: ['80s', '90s', 'retro', 'oldies'] },
  { id: 'news',      label: '📰 Info',       tags: ['news', 'talk', 'speech'] },
]

const API_BASES = [
  'https://de1.api.radio-browser.info',
  'https://fr1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function stationGradientArt(name) {
  let h = 0
  for (const c of (name || '')) { h = ((h << 5) - h) + c.charCodeAt(0); h |= 0 }
  const hue = Math.abs(h) % 360
  const words = (name || 'R').trim().split(/\s+/).slice(0, 2)
  // Wyśrodkowanie na płótnie 512x512
  const baseY = words.length === 1 ? 256 : 210
  const textEls = words.map((w, i) =>
    `<text x="256" y="${baseY + i * 90}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="80" font-weight="800" fill="rgba(255,255,255,0.92)">${w.slice(0, 10)}</text>`
  ).join('')
  
  // Wymuszony rozmiar 512x512 dla systemów (iOS lock screen), marginy zapewniające brak ucięcia tekstu (viewBox)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="hsl(${hue},55%,52%)"/><stop offset="100%" stop-color="hsl(${hue},65%,18%)"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="30"/>${textEls}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function getStationBgColor(idStr) {
  let h = 0
  for (const c of String(idStr)) { h = ((h << 5) - h) + c.charCodeAt(0); h |= 0 }
  const hue = Math.abs(h) % 360
  // Bardzo leciutki, wyblakły kolor (jasność 60%, bardzo niska wartość alpha by wtapiał się w ciemne tło)
  return `hsla(${hue}, 40%, 60%, 0.04)`
}

function stationMatchesGenre(station, genre) {
  if (!genre?.tags) return true
  const tags = String(station.tags || '').toLowerCase()
  return genre.tags.some(t => tags.includes(t))
}

async function fetchFromApi(base, tagList, limit = 40, country = '') {
  const params = new URLSearchParams({ hidebroken: 'true', order: 'votes', reverse: 'true', limit: String(limit), tagList })
  if (country) params.set('countrycode', country)
  const r = await fetch(`${base}/json/stations/search?${params}`)
  if (!r.ok) throw new Error(`radio-browser ${r.status}`)
  return r.json()
}

function sanitizeStationImageUrl(url) {
  if (!url || typeof url !== 'string') return ''
  return url.startsWith('https://') ? url : ''
}

// ─── Inline SVG icons (no external dep, zero network cost) ──────────────────
const Ic = {
  music:    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>,
  heart:    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>,
  heartOut: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  globe:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  flag:     <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zm0 7v-7"/></svg>,
  spinner:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="ic-spin"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>,
  plus:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>,
  noFav:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>,
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RadioPWA() {
  const [tvFocusIdx, setTvFocusIdx] = useState(-1)
  const [extraStations, setExtraStations] = useState([])
  const [currentStation, setCurrentStation] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [genreId, setGenreId] = useState('all')
  const [nowPlaying, setNowPlaying] = useState('')
  const [streamIdx, setStreamIdx] = useState(0)
  const [loadingApi, setLoadingApi] = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [polandOnly, setPolandOnly]       = useState(true)
  const [onlineCount, setOnlineCount]     = useState(0)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [activeTab, setActiveTab]             = useState('all') // 'all' | 'fav'
  const [favorites, setFavorites]             = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pwa-favs') || '[]')) }
    catch { return new Set() }
  })
  // Full station objects stored for favorites — survive cache expiry
  const [favStations, setFavStations]         = useState(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('pwa-favs-data') || '[]')
      return new Map(arr.map(s => [s.id, s]))
    } catch { return new Map() }
  })
  const [searchApiResults, setSearchApiResults] = useState([])
  const [initialLoading, setInitialLoading]   = useState(false)
  const [listScrollTop, setListScrollTop]     = useState(0)
  const [listHeight, setListHeight]           = useState(400)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchDraft, setSearchDraft]         = useState('')
  const [isNameTooLong, setIsNameTooLong]     = useState(false)
  const isTV = useMemo(() => window.matchMedia('(hover: none) and (pointer: coarse)').matches === false && !('ontouchstart' in window), [])

  const audioRef           = useRef(null)
  const listRef            = useRef(null)
  const stationNameRef     = useRef(null)
  const tvRowRefs          = useRef([])
  const failedUrls         = useRef(new Set())
  const nowPlayingTimerRef = useRef(null)
  const isPlayingRef       = useRef(false)
  const stallTimerRef      = useRef(null)
  const currentSrcRef      = useRef('')
  const searchInputRef     = useRef(null)
  const searchModalInputRef = useRef(null)
  const isIOS              = useMemo(() => {
    const ua = navigator.userAgent || ''
    const iDevice = /iPad|iPhone|iPod/.test(ua)
    const iPadOSDesktopUA = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
    return iDevice || iPadOSDesktopUA
  }, [])

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  // Measure station name overflow and set --scroll-px for ticker animation
  useEffect(() => {
    const el = stationNameRef.current
    if (!el) return

    // Run after a paint so the element is laid out at its natural width
    const raf = requestAnimationFrame(() => {
      const wrapper = el.parentElement
      if (!wrapper) return

      // Measure wrapper's visible width (the clip boundary)
      const wrapW = wrapper.getBoundingClientRect().width

      // Measure text's natural width by temporarily removing the max-width cap
      const prevMaxW = el.style.maxWidth
      el.style.maxWidth = 'none'
      const textW = el.getBoundingClientRect().width
      el.style.maxWidth = prevMaxW

      const overflowPx = Math.round(textW - wrapW)
      if (overflowPx > 4) {
        // Set how many pixels the animation needs to scroll left
        el.style.setProperty('--scroll-px', String(overflowPx))
        setIsNameTooLong(true)
      } else {
        el.style.removeProperty('--scroll-px')
        setIsNameTooLong(false)
      }
    })

    return () => cancelAnimationFrame(raf)
  }, [currentStation?.name])

  const openIOSSearchPrompt = useCallback(() => {
    setSearchDraft(searchQuery)
    setShowSearchModal(true)
    const input = searchModalInputRef.current
    if (input) {
      input.focus()
      const len = searchQuery.length
      try { input.setSelectionRange(len, len) } catch {}
    }
  }, [searchQuery])

  const closeSearchModal = useCallback(() => {
    setShowSearchModal(false)
  }, [])

  const applySearchModal = useCallback(() => {
    const active = document.activeElement
    if (active && typeof active.blur === 'function') active.blur()
    setSearchQuery(searchDraft.trim())
    setShowSearchModal(false)
  }, [searchDraft])

  const clearSearchInline = useCallback(() => {
    setSearchQuery('')
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  const clearSearchModal = useCallback(() => {
    setSearchDraft('')
    requestAnimationFrame(() => {
      const input = searchModalInputRef.current
      if (!input) return
      input.focus()
      try { input.setSelectionRange(0, 0) } catch {}
    })
  }, [])

  useEffect(() => {
    if (!showSearchModal) return
    const t = requestAnimationFrame(() => {
      const input = searchModalInputRef.current
      if (!input) return
      input.focus()
      const len = input.value.length
      try { input.setSelectionRange(len, len) } catch {}
    })
    return () => cancelAnimationFrame(t)
  }, [showSearchModal])

  // ─── Audio cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) { audio.pause(); audio.src = ''; audio.load() }
    }
  }, [])

  // ─── Firebase online presence ─────────────────────────────────────────────
  useEffect(() => {
    const connectedRef = fbRef(db, '.info/connected')
    let myPresenceRef = null
    const unsubConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        myPresenceRef = push(fbRef(db, 'presence'))
        onDisconnect(myPresenceRef).remove()
        set(myPresenceRef, { ts: serverTimestamp() })
      }
    })
    const unsubCount = onValue(fbRef(db, 'presence'), (snap) => {
      const val = snap.val()
      setOnlineCount(val ? Object.keys(val).length : 0)
    })
    return () => {
      unsubConnected()
      unsubCount()
      if (myPresenceRef) remove(myPresenceRef)
    }
  }, [])

  // ─── Auto-load 300 Polish stations on mount (24h sessionStorage cache) ─────
  useEffect(() => {
    const CACHE_KEY = 'pwa-pl-cache'
    const CACHE_TS  = 'pwa-pl-cache-ts'
    const cached = localStorage.getItem(CACHE_KEY)
    const ts     = Number(localStorage.getItem(CACHE_TS) || 0)
    if (cached && Date.now() - ts < 7 * 86400000) {
      try {
        setExtraStations(JSON.parse(cached).map((station) => ({
          ...station,
          favicon: sanitizeStationImageUrl(station.favicon),
        })))
        return
      } catch {}
    }
    setInitialLoading(true)
    ;(async () => {
      for (const base of API_BASES) {
        try {
          const r = await fetch(
            `${base}/json/stations/search?countrycode=PL&hidebroken=true&order=votes&reverse=true&limit=300`
          )
          if (!r.ok) continue
          const data = await r.json()
          const existing = new Set(CURATED.map(s => s.url))
          const fresh = data
            .filter(s => {
              const u = s.url_resolved || s.url || ''
              return u.startsWith('https://') && !existing.has(u)
            })
            .map(s => ({
              id: s.stationuuid,
              name: s.name,
              tags: s.tags,
              countrycode: 'PL',
              favicon: sanitizeStationImageUrl(s.favicon),
              votes: Number(s.votes) || 0,
              streamCandidates: [s.url_resolved, s.url].filter(u => u?.startsWith('https://')),
              url: s.url_resolved || s.url,
            }))
            .filter(s => s.streamCandidates.length > 0)
          setExtraStations(fresh)
          localStorage.setItem(CACHE_KEY, JSON.stringify(fresh))
          localStorage.setItem(CACHE_TS, String(Date.now()))
          break
        } catch {}
      }
      setInitialLoading(false)
    })()
  }, [])

  // ─── Play a station ───────────────────────────────────────────────────────
  const playStation = useCallback(async (station, urlIdx = 0) => {
    const audio = audioRef.current
    if (!audio) return
    const urls = station.streamCandidates || [station.url]
    const url  = urls[urlIdx] || urls[0]
    if (!url) return
    clearTimeout(stallTimerRef.current)
    setIsBuffering(true)
    setCurrentStation(station)
    setStreamIdx(urlIdx)
    setNowPlaying('')
    currentSrcRef.current = url
    audio.src = url
    try {
      await audio.play()
      localStorage.setItem('pwa-radio-last-id', station.id)
    } catch {
      setIsBuffering(false)
    }
  }, [])

  // ─── Toggle favorite ──────────────────────────────────────────────────────
  const toggleFavorite = useCallback((station, e) => {
    e.stopPropagation()
    const stationId = station.id
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(stationId)) next.delete(stationId)
      else next.add(stationId)
      localStorage.setItem('pwa-favs', JSON.stringify([...next]))
      return next
    })
    setFavStations(prev => {
      const next = new Map(prev)
      if (next.has(stationId)) next.delete(stationId)
      else next.set(stationId, station)
      localStorage.setItem('pwa-favs-data', JSON.stringify([...next.values()]))
      return next
    })
  }, [])

  // ─── Audio element events ─────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay    = () => { setIsPlaying(true);  setIsBuffering(false); clearTimeout(stallTimerRef.current) }
    const onPause   = () => setIsPlaying(false)
    const onWaiting = () => {
      setIsBuffering(true)
      clearTimeout(stallTimerRef.current)
      stallTimerRef.current = setTimeout(() => {
        // Still stalled after 12s — force reconnect
        if (!isPlayingRef.current && !currentSrcRef.current) return
        const src = currentSrcRef.current
        if (!src || !isPlayingRef.current) return
        audio.src = ''
        audio.load()
        audio.src = src
        audio.play().catch(() => {})
      }, 12000)
    }
    const onPlaying = () => { setIsPlaying(true);  setIsBuffering(false); clearTimeout(stallTimerRef.current) }
    const onError   = () => {
      const s = currentStation                                 // snapshot via ref below
      if (!s) return
      const urls = s.streamCandidates || []
      const next = streamIdx + 1
      if (next < urls.length && !failedUrls.current.has(urls[next])) {
        failedUrls.current.add(audio.src)
        playStation(s, next)
      } else {
        setIsPlaying(false); setIsBuffering(false)
      }
    }
    audio.addEventListener('play',    onPlay)
    audio.addEventListener('pause',   onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('error',   onError)
    return () => {
      audio.removeEventListener('play',    onPlay)
      audio.removeEventListener('pause',   onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('error',   onError)
    }
  // currentStation and streamIdx need to be refs to avoid stale closure — use a ref trick:
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playStation])

  const currentStationRef = useRef(currentStation)
  const streamIdxRef      = useRef(streamIdx)
  useEffect(() => { currentStationRef.current = currentStation }, [currentStation])
  useEffect(() => { streamIdxRef.current = streamIdx }, [streamIdx])

  // Patch onError closure to use refs
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onError = () => {
      const s    = currentStationRef.current
      const idx  = streamIdxRef.current
      if (!s) return
      const urls = s.streamCandidates || []
      const next = idx + 1
      if (next < urls.length && !failedUrls.current.has(urls[next])) {
        failedUrls.current.add(audio.src)
        playStation(s, next)
      } else {
        setIsPlaying(false); setIsBuffering(false)
      }
    }
    audio.addEventListener('error', onError)
    return () => audio.removeEventListener('error', onError)
  }, [playStation])

  // ─── Now-playing metadata poll via radio-browser API ─────────────────────
  useEffect(() => {
    clearInterval(nowPlayingTimerRef.current)
    const id = currentStation?.id
    if (!id || !isPlaying) return
    // Only curated stations have UUIDs — skip pwa- prefix ones
    const uuid = id.replace(/^pw-/, '')
    if (uuid === id) return   // not a radio-browser UUID
    const poll = async () => {
      for (const base of API_BASES) {
        try {
          const r = await fetch(`${base}/json/stations/byuuid/${uuid}`)
          if (!r.ok) continue
          const [data] = await r.json()
          if (data?.lastcheckok) {
            const song = String(data.lastcheckok === 1 ? (data.tags || '') : '').trim()
            if (song) setNowPlaying(song)
          }
          break
        } catch {}
      }
    }
    nowPlayingTimerRef.current = setInterval(poll, 60000)
    return () => clearInterval(nowPlayingTimerRef.current)
  }, [currentStation, isPlaying])

  // ─── Toggle play / pause ──────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlayingRef.current) { audio.pause() }
    else if (currentStationRef.current) {
      audio.play().catch(() => {})
    }
  }, [])

  // ─── Filtered + combined station list ────────────────────────────────────
  const allStations = useMemo(() => {
    const all = [...CURATED, ...extraStations, ...searchApiResults]
    const seen = new Set()
    return all.filter(s => {
      const k = s.url?.toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k); return true
    })
  }, [extraStations, searchApiResults])

  const filteredStations = useMemo(() => {
    // Favorites tab — merge loaded stations with stored data (so favs survive cache expiry)
    if (activeTab === 'fav') {
      return [...favorites].map(id => allStations.find(s => s.id === id) || favStations.get(id)).filter(Boolean)
    }
    // When searching — skip genre/country filters, search everything
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      return allStations.filter(s => s.name.toLowerCase().includes(q))
    }
    let list = allStations
    if (polandOnly) list = list.filter(s => s.id.startsWith('pw-') || s.countrycode === 'PL')
    const genre = GENRES.find(g => g.id === genreId)
    if (genreId !== 'all') list = list.filter(s => stationMatchesGenre(s, genre))
    return list
  }, [allStations, genreId, polandOnly, searchQuery, activeTab, favorites])

  // ─── Track list container height (for virtual scroll calculations) ────────
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setListHeight(entry.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ─── Live API search for unloaded stations ─────────────────────────────────
  const extraStationsRef = useRef(extraStations)
  useEffect(() => { extraStationsRef.current = extraStations }, [extraStations])

  useEffect(() => {
    const q = searchQuery.trim()
    setSearchApiResults([])
    if (q.length < 2) return
    const timer = setTimeout(async () => {
      const allLocal = [...CURATED, ...extraStationsRef.current]
      const localCount = allLocal.filter(s => s.name.toLowerCase().includes(q.toLowerCase())).length
      if (localCount >= 12) return // enough local results, save mobile data
      for (const base of API_BASES) {
        try {
          const params = new URLSearchParams({ name: q, hidebroken: 'true', order: 'votes', reverse: 'true', limit: '20' })
          const r = await fetch(`${base}/json/stations/search?${params}`)
          if (!r.ok) continue
          const data = await r.json()
          const existingUrls = new Set(allLocal.map(s => s.url))
          const fresh = data
            .filter(s => {
              const u = s.url_resolved || s.url || ''
              return u.startsWith('https://') && !existingUrls.has(u)
            })
            .map(s => ({
              id: s.stationuuid, name: s.name, tags: s.tags,
              countrycode: (s.countrycode || '').toUpperCase(),
              favicon: sanitizeStationImageUrl(s.favicon), votes: Number(s.votes) || 0,
              streamCandidates: [s.url_resolved, s.url].filter(u => u?.startsWith('https://')),
              url: s.url_resolved || s.url,
            }))
            .filter(s => s.streamCandidates.length > 0)
          setSearchApiResults(fresh)
          break
        } catch {}
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // ─── Prev / Next station ──────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (!filteredStations.length) return
    const idx = filteredStations.findIndex(s => s.id === currentStationRef.current?.id)
    playStation(filteredStations[(idx + 1) % filteredStations.length])
  }, [filteredStations, playStation])

  const goPrev = useCallback(() => {
    if (!filteredStations.length) return
    const idx = filteredStations.findIndex(s => s.id === currentStationRef.current?.id)
    playStation(filteredStations[(idx - 1 + filteredStations.length) % filteredStations.length])
  }, [filteredStations, playStation])

  // ─── Media Session API ───────────────────────────────────────────────────────

  const buildArtwork = useCallback((station) => {
    if (!station) return []
    const art = []
    const fav = station.favicon || ''
    if (fav && !fav.endsWith('.ico') && !fav.includes('favicon.ico')) {
      // Serwery WP CDN blokują pobieranie obrazków w tle przez iOS (brak odpowiednich nagłówków z Safari)
      // i mają nietypowe adresy URL. Puszczamy je przez niezawodne, darmowe proxy obrazkowe (wsrv.nl), 
      // które zwraca czysty, sformatowany i kompatybilny plik .jpg dla ekranu blokady.
      let safeFav = fav;
      if (fav.includes('v.wpimg.pl')) {
        safeFav = `https://wsrv.nl/?url=${encodeURIComponent(fav.replace(/^https?:\/\//, ''))}&output=jpg`;
      } else {
        safeFav = fav.includes('#') ? fav : fav + '#.jpg';
      }
      
      art.push({ src: safeFav, sizes: '512x512', type: 'image/jpeg' })
      art.push({ src: safeFav, sizes: '512x512', type: 'image/png' })
    }
    art.push({ src: stationGradientArt(station.name), sizes: '512x512', type: 'image/svg+xml' })
    art.push({ src: stationGradientArt(station.name), sizes: '512x512', type: 'image/png' })
    return art
  }, [])

  // Register action handlers once on mount
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play',          () => { audioRef.current?.play().catch(() => {}) })
    navigator.mediaSession.setActionHandler('pause',         () => { audioRef.current?.pause() })
    navigator.mediaSession.setActionHandler('stop',          () => { audioRef.current?.pause() })
    navigator.mediaSession.setActionHandler('nexttrack',     () => goNext())
    navigator.mediaSession.setActionHandler('previoustrack', () => goPrev())
    // UWAGA: Nigdy nie dotykamy tu 'seekforward' ani 'seekbackward', nawet ustawiając je na null. 
    // Jakikolwiek ślad tych akcji w kodzie sprawia, że iOS ukrywa guziki zmiany utworów!
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update next/prev handlers when the station list changes
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('nexttrack',     () => goNext())
    navigator.mediaSession.setActionHandler('previoustrack', () => goPrev())
    // Skoro iOS na siłę i tak pokazuje ikonki +/- 10 dla strumieni radiowych bez końca, 
    // to podpinamy pod nie zmianę stacji, by przynajmniej działały zgodnie z oczekiwaniami!
    navigator.mediaSession.setActionHandler('seekforward',   () => goNext())
    navigator.mediaSession.setActionHandler('seekbackward',  () => goPrev())
  }, [goNext, goPrev])

  // Update metadata immediately when station changes — don't wait for isPlaying!
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (!currentStation) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  currentStation.name,
      artist: nowPlaying || 'Radio',
      album:  'Music Radio · MrPerru',
      artwork: buildArtwork(currentStation),
    })

    // Usunięto 'setPositionState' - natywny iOS pokaże wtedy guziki 'następny/poprzedni utwór' zamiast paska przewijania czasu
  }, [currentStation, nowPlaying, buildArtwork])

  // Keep playbackState in sync so the car knows playing vs paused
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (!currentStation) { navigator.mediaSession.playbackState = 'none'; return }
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying, currentStation])


  // ─── Keyboard / TV D-pad navigation ─────────────────────────────────────
  const filteredStationsRef = useRef(filteredStations)
  useEffect(() => { filteredStationsRef.current = filteredStations }, [filteredStations])
  const tvFocusIdxRef = useRef(tvFocusIdx)
  useEffect(() => { tvFocusIdxRef.current = tvFocusIdx }, [tvFocusIdx])

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      const stations = filteredStationsRef.current
      const cur = tvFocusIdxRef.current

      switch (e.key) {
        case ' ':
        case 'MediaPlayPause':
          e.preventDefault(); togglePlay(); break

        // ── TV list navigation ───────────────────────────────────────────────
        case 'ArrowDown': {
          e.preventDefault()
          const next = cur < stations.length - 1 ? cur + 1 : 0
          setTvFocusIdx(next)
          tvRowRefs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          tvRowRefs.current[next]?.focus({ preventScroll: true })
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const prev = cur > 0 ? cur - 1 : stations.length - 1
          setTvFocusIdx(prev)
          tvRowRefs.current[prev]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          tvRowRefs.current[prev]?.focus({ preventScroll: true })
          break
        }
        case 'Enter': {
          if (cur >= 0 && stations[cur]) {
            e.preventDefault()
            playStation(stations[cur])
          }
          break
        }
        case 'Escape':
        case 'Backspace':
          if (cur >= 0) { e.preventDefault(); setTvFocusIdx(-1) }
          break

        // ── Media remote prev/next ───────────────────────────────────────────
        case 'ArrowRight': case 'MediaTrackNext':
          e.preventDefault(); goNext(); break
        case 'ArrowLeft': case 'MediaTrackPrevious':
          e.preventDefault(); goPrev(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, goNext, goPrev, playStation])



  // ─── Restore last station on mount (default: Vibe FM) ──────────────────
  useEffect(() => {
    const lastId = localStorage.getItem('pwa-radio-last-id')
    const target = lastId
      ? CURATED.find(s => s.id === lastId)
      : CURATED.find(s => s.id === 'pw-vibefm')
    if (target) setCurrentStation(target)
  }, [])


  // ─── Derived ─────────────────────────────────────────────────────────────
  const art = currentStation
    ? (currentStation.favicon || stationGradientArt(currentStation.name))
    : null

  const activeFilters = (genreId !== 'all' ? 1 : 0) + (polandOnly ? 1 : 0)

  // ─── Virtual scroll window ────────────────────────────────────────────────
  const ROW_HEIGHT = 64
  const OVERSCAN   = 5
  const totalRows  = filteredStations.length
  const startIdx   = Math.max(0, Math.floor(listScrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx     = Math.min(totalRows, Math.ceil((listScrollTop + listHeight) / ROW_HEIGHT) + OVERSCAN)
  const spacerTop  = startIdx * ROW_HEIGHT
  const spacerBot  = Math.max(0, (totalRows - endIdx) * ROW_HEIGHT)

  return (
    <div className="pwa-shell">
      {/* Hidden audio element — must be in DOM for iOS Safari autoplay policy */}
      <audio ref={audioRef} preload="none" style={{display:'none'}} />

      {/* Main layout */}
      <div className="pwa-layout">

        {/* Header */}
        <header className="pwa-header">
          <div className="pwa-brand">
            <img src="/branding/appicon.png" alt="" className="pwa-brand-logo" />
            <div className="pwa-brand-titles">
              <span className="pwa-brand-text">Music Radio</span>
              <span className="pwa-brand-sub">Powered by MrPerru.</span>
            </div>
          </div>

          {/* Download button — desktop only */}
          <a
            href="https://mrp3rru.github.io/music-app-web-site/"
            target="_blank"
            rel="noopener noreferrer"
            className="pwa-download-btn pwa-desktop-only"
            aria-label="Pobierz aplikację na komputer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Pobierz na PC
          </a>

          <div className="pwa-header-right">
            <div className="pwa-online" aria-label={`${onlineCount} użytkowników online`}>
              <span className="pwa-online-dot" />
              <span className="pwa-online-count">{onlineCount}</span>
              <span className="pwa-online-label">online</span>
            </div>
          </div>
        </header>

        {/* Now Playing */}
        <section className="pwa-now-playing" aria-live="polite">
          <div className="pwa-art-wrap">
            {art ? (
              <img
                src={art} alt={currentStation?.name || ''}
                className="pwa-station-logo"
                onError={e => { e.currentTarget.src = stationGradientArt(currentStation?.name || 'R') }}
              />
            ) : (
              <div className="pwa-station-logo placeholder-logo">{Ic.music}</div>
            )}
            {(isBuffering || isPlaying) && (
              <div
                className={`pwa-buffering-ring${isPlaying && !isBuffering ? ' playing' : ''}`}
                aria-hidden="true"
              />
            )}
          </div>

          <div className="pwa-station-info">
            <div className="pwa-station-name-wrapper">
              <h1 
                className={`pwa-station-name${isNameTooLong ? ' animate-marquee' : ''}`} 
                ref={stationNameRef}
                data-text={currentStation?.name || 'Wybierz stację...'}
              >
                {currentStation?.name || 'Wybierz stację...'}
              </h1>
            </div>
            {nowPlaying && <p className="pwa-now-song" title={nowPlaying}>{nowPlaying}</p>}
            {isBuffering && !isPlaying && <p className="pwa-status">Łączenie...</p>}
            {currentStation && !isBuffering && !isPlaying && <p className="pwa-status">Zatrzymano</p>}
          </div>

          <nav className="pwa-controls" aria-label="Odtwarzanie">
            <button className="pwa-btn" onClick={goPrev} aria-label="Poprzednia stacja">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
            </button>
            <button
              className={`pwa-btn pwa-btn-play${isPlaying ? ' active' : ''}`}
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pauza' : 'Odtwórz'}
            >
              {isPlaying
                ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              }
            </button>
            <button className="pwa-btn" onClick={goNext} aria-label="Następna stacja">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8l-5.5 4zM16 6h2v12h-2z"/></svg>
            </button>
          </nav>
        </section>

        {/* Search bar + filter button */}
        <div className="pwa-search-bar" role="search">
          {searchQuery && (
            <button
              type="button"
              className="pwa-search-clear left"
              onPointerDown={e => e.preventDefault()}
              onClick={clearSearchInline}
              aria-label="Wyczyść"
            >✕</button>
          )}
          <svg className="pwa-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          {isIOS ? (
            <button
              type="button"
              className={`pwa-search-input pwa-search-input-btn${searchQuery ? ' has-value' : ''}`}
              onClick={openIOSSearchPrompt}
              aria-label="Szukaj stacji"
            >
              {searchQuery || 'Szukaj stacji...'}
            </button>
          ) : (
            <input
              ref={searchInputRef}
              type="text"
              className="pwa-search-input"
              placeholder="Szukaj stacji..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
              aria-label="Szukaj stacji"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="search"
            />
          )}
          <button
            type="button"
            className={`pwa-filter-btn${activeFilters > 0 ? ' has-active' : ''}`}
            onClick={() => setShowFilterPanel(v => !v)}
            aria-label="Filtry"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            {activeFilters > 0 && <span className="pwa-filter-badge">{activeFilters}</span>}
          </button>
        </div>

        {/* Tabs: Stacje / Ulubione */}
        <div className="pwa-tabs" role="tablist">
          <button
            role="tab"
            className={`pwa-tab${activeTab === 'all' ? ' active' : ''}`}
            onClick={() => setActiveTab('all')}
            aria-selected={activeTab === 'all'}
          >
            {Ic.music} Stacje
            {!initialLoading && filteredStations.length > 0 && <span className="pwa-tab-badge">{filteredStations.length}</span>}
            {initialLoading && <span className="pwa-tab-spinner" aria-hidden="true" />}
          </button>
          <button
            role="tab"
            className={`pwa-tab${activeTab === 'fav' ? ' active' : ''}`}
            onClick={() => setActiveTab('fav')}
            aria-selected={activeTab === 'fav'}
          >
            {Ic.heart} Ulubione
            {favorites.size > 0 && <span className="pwa-tab-badge">{favorites.size}</span>}
          </button>
        </div>

        {/* Scroll arrows bar — desktop/TV only, above the list */}
        <div className="pwa-scroll-arrows pwa-desktop-only" aria-hidden="true">
          <button
            className="pwa-scroll-arrow"
            aria-label="Przewiń listę w górę"
            onPointerDown={() => {
              listRef.current?.scrollBy({ top: -ROW_HEIGHT * 3, behavior: 'smooth' })
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="6 15 12 9 18 15"/>
            </svg>
          </button>
          <button
            className="pwa-scroll-arrow"
            aria-label="Przewiń listę w dół"
            onPointerDown={() => {
              listRef.current?.scrollBy({ top: ROW_HEIGHT * 3, behavior: 'smooth' })
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>

        {/* Station list */}
        <div className="pwa-station-list" role="list" ref={listRef} onScroll={e => setListScrollTop(e.currentTarget.scrollTop)}>
          {spacerTop > 0 && <div style={{height: spacerTop, flexShrink: 0}} aria-hidden="true" />}
          {filteredStations.slice(startIdx, endIdx).map((s, relIdx) => {
            const absIdx   = startIdx + relIdx
            const isActive = currentStation?.id === s.id
            const imgSrc   = s.favicon || stationGradientArt(s.name)
            const isFav    = favorites.has(s.id)
            const isTvFocus = tvFocusIdx === absIdx
            return (
              <div
                key={s.id}
                role="listitem"
                ref={el => { tvRowRefs.current[absIdx] = el }}
                tabIndex={0}
                className={`pwa-station-row${isActive ? ' active' : ''}${isTvFocus ? ' tv-focus' : ''}`}
                onFocus={() => setTvFocusIdx(absIdx)}
                style={{ '--row-bg': getStationBgColor(s.id) }}
              >
                <button
                  className="pwa-station-btn"
                  onClick={() => playStation(s)}
                  aria-pressed={isActive}
                  aria-label={`Odtwórz ${s.name}`}
                >
                  <img
                    src={imgSrc} alt=""
                    className="pwa-row-art"
                    loading="lazy"
                    onError={e => { e.currentTarget.src = stationGradientArt(s.name) }}
                  />
                  <div className="pwa-row-info">
                    <span className="pwa-row-name">{s.name}</span>
                    {s.countrycode && <span className="pwa-row-country">{s.countrycode}</span>}
                  </div>
                  {isActive && isPlaying && (
                    <span className="pwa-card-eq" aria-hidden="true">
                      <span/><span/><span/><span/>
                    </span>
                  )}
                  {isActive && isBuffering && !isPlaying && (
                    <span className="pwa-row-dot buffering" aria-hidden="true" />
                  )}
                </button>
                <button
                  className={`pwa-fav-btn${isFav ? ' active' : ''}`}
                  onClick={e => toggleFavorite(s, e)}
                  aria-label={isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
                  tabIndex={-1}
                >
                  {isFav ? Ic.heart : Ic.heartOut}
                </button>
              </div>
            )
          })}

          {spacerBot > 0 && <div style={{height: spacerBot, flexShrink: 0}} aria-hidden="true" />}
          {/* Loading indicator */}
          {activeTab !== 'fav' && initialLoading && (
            <div className="pwa-loading-hint">{Ic.spinner} Ładowanie stacji...</div>
          )}
          {activeTab === 'fav' && favorites.size === 0 && (
            <div className="pwa-loading-hint">{Ic.heartOut} Brak ulubionych — naciśnij ikonę serca przy stacji aby dodać.</div>
          )}
        </div>{/* /pwa-station-list */}

      </div>{/* /pwa-layout */}

      {/* Filter panel — bottom sheet */}
      {showFilterPanel && (
        <div className="pwa-filter-overlay" onClick={() => setShowFilterPanel(false)}>
          <div className="pwa-filter-panel" onClick={e => e.stopPropagation()}>
            <div className="pwa-filter-handle" />
            <p className="pwa-filter-title">Filtry</p>

            <p className="pwa-filter-section">Kraj</p>
            <div className="pwa-filter-chips">
              <button
                className={`filter-chip${polandOnly ? ' active' : ''}`}
                onClick={() => setPolandOnly(v => !v)}
              >
              {Ic.flag} Polska
              </button>
              <button
                className={`filter-chip${!polandOnly ? ' active' : ''}`}
                onClick={() => setPolandOnly(false)}
              >
              {Ic.globe} Cały świat
              </button>
            </div>

            <p className="pwa-filter-section">Gatunek</p>
            <div className="pwa-filter-chips">
              {GENRES.map(g => (
                <button
                  key={g.id}
                  className={`filter-chip${genreId === g.id ? ' active' : ''}`}
                  onClick={() => { setGenreId(g.id); setShowFilterPanel(false) }}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <button className="pwa-filter-close" onClick={() => setShowFilterPanel(false)}>
              Zamknij
            </button>
          </div>
        </div>
      )}

      {/* iOS search modal (replaces system prompt) */}
      {isIOS && (
        <div className={`pwa-search-modal-overlay${showSearchModal ? ' open' : ''}`} onClick={closeSearchModal} aria-hidden={!showSearchModal}>
          <div className="pwa-search-modal" onClick={e => e.stopPropagation()}>
            <p className="pwa-search-modal-title">Szukaj stacji</p>
            <input
              ref={searchModalInputRef}
              type="text"
              className="pwa-search-modal-input"
              value={searchDraft}
              onChange={e => setSearchDraft(e.target.value)}
              placeholder="Np. Vibe, RMF, ZET"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="search"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applySearchModal()
                }
                if (e.key === 'Escape') closeSearchModal()
              }}
            />
            <div className="pwa-search-modal-actions">
              <button
                type="button"
                className="pwa-search-modal-btn clear"
                onPointerDown={e => e.preventDefault()}
                onClick={clearSearchModal}
              >Clear</button>
              <button type="button" className="pwa-search-modal-btn ghost" onClick={closeSearchModal}>Anuluj</button>
              <button type="button" className="pwa-search-modal-btn solid" onClick={applySearchModal}>Szukaj</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
