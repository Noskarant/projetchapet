"use client";

import { useId, type CSSProperties } from 'react';
import { mascotVoiceLevel, type MascotMood } from '@/lib/mascot';
import './manufeo-mascot.css';

/** Articulated vector character: limbs, eyes, head and pencil animate independently. */
export default function ManufeoMascot({ mood = 'idle', level = 0, className = '' }: { mood?: MascotMood; level?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const paint = (name: string) => `url(#${id}-${name})`;
  return <span className={`manufeo-mascot ${className}`} data-mood={mood} style={{ '--mascot-level': mascotVoiceLevel(level) } as CSSProperties} aria-hidden="true">
    <svg viewBox="0 0 240 300" fill="none" focusable="false">
      <defs>
        <linearGradient id={`${id}-ivory`} x1="60" y1="60" x2="180" y2="180" gradientUnits="userSpaceOnUse"><stop stopColor="#fffdf3"/><stop offset="1" stopColor="#c8c8bf"/></linearGradient>
        <linearGradient id={`${id}-blue`} x1="80" y1="10" x2="180" y2="100" gradientUnits="userSpaceOnUse"><stop stopColor="#18baff"/><stop offset=".55" stopColor="#0878ed"/><stop offset="1" stopColor="#064687"/></linearGradient>
        <linearGradient id={`${id}-navy`} x1="80" y1="130" x2="165" y2="275" gradientUnits="userSpaceOnUse"><stop stopColor="#244d6e"/><stop offset="1" stopColor="#091e34"/></linearGradient>
      </defs>
      <ellipse cx="121" cy="287" rx="65" ry="7" fill="#000" opacity=".2"/>
      <g className="mascot-body" stroke="#102c46" strokeWidth="3" strokeLinejoin="round">
        <path d="M83 216L79 271Q96 282 112 273L118 232L126 232L131 273Q151 281 164 271L158 216Z" fill={paint('navy')}/>
        <path d="M79 262L74 275Q61 279 63 290L109 290L113 277L104 269Z" fill="#a97437"/>
        <path d="M132 269L130 289L178 290Q181 278 166 275L163 262Z" fill="#a97437"/>
        <path d="M64 283Q84 278 110 282L109 292L62 292Z" fill="#102b40"/>
        <path d="M131 282Q154 278 178 284L179 292L130 292Z" fill="#102b40"/>
        <path d="M82 273L99 275M143 274L162 273" stroke="#e0a762"/>
        <rect x="73" y="139" width="94" height="91" rx="29" fill={paint('ivory')}/>
        <path d="M79 145L92 144L97 179L143 179L148 144L161 146L164 226L77 226Z" fill={paint('navy')}/>
        <path d="M86 147L92 170M154 147L149 170" stroke="#4282aa" strokeWidth="2"/>
        <rect x="87" y="166" width="14" height="10" rx="3" fill="#102c46"/><rect x="141" y="166" width="14" height="10" rx="3" fill="#102c46"/>
        <path d="M100 180H142V206Q121 219 100 206Z" fill="#154567" stroke="#387197" strokeWidth="2"/>
        <path d="M110 201V186L120 196L130 186V201" stroke="#f7fbff" strokeWidth="5" strokeLinecap="round"/><path d="M130 186V201" stroke="#00b2ff" strokeWidth="5" strokeLinecap="round"/>
        <rect x="77" y="219" width="86" height="12" rx="4" fill="#14283a"/><rect x="110" y="217" width="22" height="16" rx="3" fill="#587084"/><rect x="116" y="221" width="10" height="8" rx="1" fill="#112b41"/>
        <path d="M74 221L64 249L84 252L91 228" fill="#143c58"/><path d="M69 217L74 246" stroke="#e1a52d" strokeWidth="6"/><path d="M68 214L69 219" stroke="#df6849" strokeWidth="6"/>
      </g>
      <g className="mascot-book-arm" stroke="#16374e" strokeWidth="3" strokeLinejoin="round">
        <path d="M161 151Q178 155 184 177L180 204Q167 213 157 202L153 177Z" fill={paint('ivory')}/>
        <g className="mascot-notebook"><rect x="148" y="168" width="49" height="62" rx="5" transform="rotate(12 148 168)" fill="#b88247"/><path d="M158 174L190 181M155 184L187 191M153 194L185 201" stroke="#e3bd87" strokeWidth="2"/>
          <path d="M151 172L145 171M149 182L143 181M147 192L141 191M145 202L139 201M143 212L137 211" stroke="#35506a" strokeWidth="4" strokeLinecap="round"/>
        </g>
        <path d="M186 196Q194 187 201 195L195 215Q188 222 179 214L178 205Z" fill={paint('ivory')}/>
        <path d="M185 204L195 207M183 211L192 214" stroke="#a9b3b2" strokeWidth="2"/>
      </g>
      <g className="mascot-head" stroke="#16374e" strokeWidth="3" strokeLinejoin="round">
        <rect x="108" y="124" width="27" height="20" rx="7" fill="#294555"/>
        <ellipse cx="58" cy="91" rx="15" ry="24" fill={paint('ivory')}/><ellipse cx="185" cy="91" rx="15" ry="24" fill={paint('ivory')}/>
        <ellipse cx="57" cy="91" rx="8" ry="16" fill={paint('blue')}/><ellipse cx="186" cy="91" rx="8" ry="16" fill={paint('blue')}/>
        <rect x="58" y="52" width="127" height="83" rx="26" fill={paint('ivory')}/>
        <rect x="69" y="64" width="104" height="60" rx="19" fill="#081d2b"/>
        <path d="M80 75Q106 64 143 73" stroke="#ffffff" opacity=".08" strokeWidth="6" strokeLinecap="round"/>
        <g className="mascot-eyes" stroke="#36c1ff" strokeWidth="5" strokeLinecap="round"><path d="M87 92Q94 77 102 92"/><path d="M140 92Q148 77 155 92"/></g>
        <path className="mascot-smile" d="M109 108Q121 117 134 106" stroke="#fff6dc" strokeWidth="3" strokeLinecap="round"/>
        <path d="M56 56Q60 17 91 10Q125 -3 155 12Q181 26 186 58Z" fill={paint('blue')}/>
        <path d="M102 10Q95 25 96 51M128 6Q121 22 124 51M151 15Q153 31 151 50" stroke="#025ca8" strokeWidth="4"/><path d="M107 11Q103 29 104 47" stroke="#76d9ff" opacity=".55" strokeWidth="3"/>
        <path d="M50 54Q115 39 190 55L194 66Q120 54 48 66Z" fill={paint('blue')}/>
      </g>
      <g className="mascot-action-arm" stroke="#16374e" strokeWidth="3" strokeLinejoin="round">
        <path d="M75 151Q62 143 53 156L48 179Q51 196 66 195L80 169Z" fill={paint('ivory')}/>
        <g className="mascot-forearm">
          <path d="M56 178L43 153Q37 141 48 134Q60 129 67 143L77 169Q77 180 65 185Z" fill={paint('ivory')}/>
          <g className="mascot-hand"><path d="M42 144L33 134Q28 130 32 125L35 124L30 110Q29 105 34 104Q39 103 41 110L43 116L42 98Q42 92 47 92Q53 92 53 100L54 114L58 100Q61 94 66 98Q70 101 67 110L64 125L69 121Q75 117 78 123Q80 127 73 137L62 150Z" fill={paint('ivory')}/>
          <path d="M44 127L54 130M48 136L59 137" stroke="#a6b2b5" strokeWidth="2"/>
          </g>
          <g className="mascot-pencil"><path d="M56 112L87 162" stroke="#eeb844" strokeWidth="6"/><path d="M87 162L92 173L84 168Z" fill="#e9d5b2" strokeWidth="1"/><path d="M90 170L92 173" stroke="#193348" strokeWidth="2"/><path d="M54 109L57 114" stroke="#dc6957" strokeWidth="7"/></g>
          <g className="mascot-thumb"><path d="M43 142L41 125Q42 116 48 119L52 129L62 130Q69 133 65 140L60 154L47 153Z" fill={paint('ivory')}/></g>
        </g>
      </g>
      <g className="mascot-writing-arm" stroke="#16374e" strokeWidth="3" strokeLinejoin="round">
        <path d="M59 168Q53 178 68 188L127 202Q140 201 141 189L139 181L76 163Z" fill={paint('ivory')}/>
        <path d="M125 184Q135 176 147 181L160 187Q167 194 159 203L142 205L128 199Z" fill={paint('ivory')}/>
        <path d="M149 181L170 204" stroke="#efb741" strokeWidth="5" strokeLinecap="round"/><path d="M170 204L174 211L167 208Z" fill="#ead4b1" strokeWidth="1"/>
        <path d="M137 191L151 194M139 198L151 201" stroke="#a6b2b5" strokeWidth="2"/>
      </g>
      <g className="mascot-sound" stroke="#88e7d5" strokeWidth="3" strokeLinecap="round"><path d="M32 76Q25 88 31 100M22 69Q11 88 21 108"/></g>
      <g className="mascot-thought"><path d="M180 26Q174 5 198 5Q226 4 226 24Q225 43 202 42L189 49L191 40Q180 38 180 26Z" fill="#0d302e" stroke="#a5e7d9" strokeWidth="2"/><circle cx="190" cy="24" r="2" fill="#a5e7d9"/><circle cx="202" cy="24" r="2" fill="#a5e7d9"/><circle cx="214" cy="24" r="2" fill="#a5e7d9"/></g>
      <g className="mascot-check"><circle cx="202" cy="50" r="16" fill="#133c35" stroke="#7ce2bb" strokeWidth="2"/><path d="M194 50L200 56L210 44" stroke="#7ce2bb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></g>
    </svg>
  </span>;
}
