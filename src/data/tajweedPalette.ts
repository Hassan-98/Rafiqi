/**
 * Tajweed colours — the ONE source of truth for the legend, text mode and the
 * Mushaf. Values are the CPAL palettes baked into the QCF V4 tajweed page
 * fonts (identical in every p{N}.woff2): `light` = palette 0 (light reader
 * themes), `dark` = palette 1 (night/black/dusk). The font's scheme merges the
 * quran.com API rule classes into 8 colours (confirmed against quran.com's own
 * TajweedBar legend). The `.tajweed-*` text-mode rules in index.css MUST mirror
 * these hexes — CSS can't import this file, so keep both in sync by hand.
 *
 * `classes` = the quran.com `text_uthmani_tajweed` classes painted this colour
 * in text mode; `cpal` = the font's palette entry index (documentation only).
 */
export interface TajweedColor {
  id: string;
  name: string;
  desc: string;
  light: string;
  dark: string;
  cpal: number[];
  classes: string[];
}

export const TAJWEED_GROUPS: { title: string; rules: TajweedColor[] }[] = [
  {
    title: 'المدود',
    rules: [
      {
        id: 'madd-2',
        name: 'المد الطبيعي',
        desc: 'يُمَد بمقدار حركتين',
        light: '#ce9e00',
        dark: '#ffc1e0',
        cpal: [5],
        classes: ['madda_normal'],
      },
      {
        id: 'madd-2-4-6',
        name: 'المد الجائز (المنفصل والعارض للسكون)',
        desc: 'يُمَد ٢ أو ٤ أو ٦ حركات',
        light: '#ff7b00',
        dark: '#ff8e3b',
        cpal: [4],
        classes: ['madda_permissible'],
      },
      {
        id: 'madd-4-5',
        name: 'المد الواجب المتصل',
        desc: 'يُمَد ٤ أو ٥ حركات',
        light: '#f40000',
        dark: '#ff5e8e',
        cpal: [9],
        classes: ['madda_obligatory'],
      },
      {
        id: 'madd-6',
        name: 'المد اللازم',
        desc: 'يُمَد ٦ حركات',
        light: '#b50000',
        dark: '#e30000',
        cpal: [3],
        classes: ['madda_necessary'],
      },
    ],
  },
  {
    title: 'النون والميم',
    rules: [
      {
        id: 'ghunnah',
        name: 'الغنة والإخفاء والإقلاب والإدغام بغنة',
        desc: 'النون والميم المشددتان (نّ، مّ)، والإخفاء الحقيقي والشفوي، والإقلاب، والإدغام بغنة والشفوي',
        light: '#09b000',
        dark: '#26b55d',
        cpal: [6],
        classes: ['ghunnah', 'ikhafa', 'ikhafa_shafawi', 'iqlab', 'idgham_ghunnah', 'idgham_shafawi'],
      },
      {
        id: 'silent',
        name: 'الإدغام وما لا يُنطق',
        desc: 'الحرف المدغم (بلا غنة، المتجانسين، المتقاربين)، وهمزة الوصل، واللام الشمسية، وما يُكتب ولا يُنطق',
        light: '#a5a5a5',
        dark: '#999999',
        cpal: [1, 2, 15],
        classes: [
          'idgham_wo_ghunnah',
          'idgham_mutajanisayn',
          'idgham_mutaqaribayn',
          'ham_wasl',
          'laam_shamsiyah',
          'slnt',
          'silent',
        ],
      },
    ],
  },
  {
    title: 'أحكام أخرى',
    rules: [
      {
        id: 'qalqala',
        name: 'القلقلة',
        desc: 'اهتزاز الصوت في حروف (قطب جد) الساكنة',
        light: '#2fadff',
        dark: '#00deff',
        cpal: [8],
        classes: ['qalaqah'],
      },
      {
        id: 'tafkhim',
        name: 'التفخيم',
        desc: 'حروف الاستعلاء (خص ضغط قظ) والراء واللام المفخّمتان — في وضع المصحف فقط',
        light: '#3f48e6',
        dark: '#3c84d5',
        cpal: [7],
        classes: [],
      },
    ],
  },
];
