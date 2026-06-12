// Galerie photo publique. Se remplit via l'admin (onglet Photographies) :
// chaque entrée référence une image uploadée (/api/images/<uuid>).
// `w`/`h` sont les dimensions natives, mesurées à l'upload, pour réserver
// l'espace dans la grille (zéro layout shift). `category` alimente les filtres.
export const photos = [];
