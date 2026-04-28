export const ACCENTS = {
  amber:  { hex: '#e8a87c', rgb: '232,168,124', dim: '#b07a50' },
  violet: { hex: '#c9a8e8', rgb: '201,168,232', dim: '#8a60b0' },
  sage:   { hex: '#9ad4ae', rgb: '154,212,174', dim: '#5a9470' },
};

export const TWEAK_DEFAULTS = {
  accent: 'violet',
  fontStyle: 'humanist',
  heroDensity: 'dense',
};

export const SECTION_MOODS = {
  default:    { bgD: [5, 5, 17],  bgL: [236, 229, 247], int: 1.0,  dft: 1.0,  pulse: false },
  hero:       { bgD: [5, 5, 17],  bgL: [236, 229, 247], int: 1.0,  dft: 1.0,  pulse: false },
  projects:   { bgD: [6, 4, 24],  bgL: [237, 232, 251], int: 1.6,  dft: 1.15, pulse: false },
  music:      { bgD: [2, 1, 8],   bgL: [230, 222, 244], int: 0.95, dft: 0.55, pulse: true  },
  about:      { bgD: [4, 3, 14],  bgL: [238, 234, 248], int: 0.62, dft: 0.28, pulse: false },
  education:  { bgD: [5, 5, 17],  bgL: [236, 229, 247], int: 0.8,  dft: 0.7,  pulse: false },
  experience: { bgD: [5, 5, 18],  bgL: [236, 230, 248], int: 0.9,  dft: 0.8,  pulse: false },
  contact:    { bgD: [5, 5, 17],  bgL: [236, 229, 247], int: 0.88, dft: 0.65, pulse: false },
  current:    { bgD: [6, 4, 18],  bgL: [237, 234, 248], int: 1.2,  dft: 0.85, pulse: false },
};

export const CURSOR_LABELS = {
  music: '♪',
  projects: '/>',
  about: '~',
  contact: '@',
  experience: '■',
  education: '/',
  current: '★',
};
