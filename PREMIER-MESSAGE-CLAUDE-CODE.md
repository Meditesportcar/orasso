# Démarrer avec Claude Code

## 1. Mettre les fichiers en place

Décompresser le zip dans `C:\Users\DELL\Orasso\` (le dossier `identite\` y est déjà) :

```
C:\Users\DELL\Orasso\
├── CLAUDE.md
├── docs\
│   ├── 00-contexte-projet.md
│   ├── 01-conception-technique-decisions.md
│   ├── 02-structure-appli-decisions.md
│   ├── 03-identite-etat-et-suite.md
│   ├── design-system\      (tokens.json, README.md, components\, assets\Logo\)
│   ├── prototype\index.html
│   └── structure-appli\    (planches du canevas)
└── identite\
```

Ouvrir un terminal dans `C:\Users\DELL\Orasso`, lancer `claude`.

## 2. Le message (à coller tel quel)

> Lis CLAUDE.md et tout ce qu'il indique dans docs/ : les quatre documents, docs/design-system (README.md, tokens.json, tous les composants), le prototype et les planches. Toute la conception est faite, rien n'est à rediscuter.
>
> Ensuite, enchaîne sans t'arrêter, dans cet ordre :
> 1. Dépôt Git et monorepo complet (apps/api, apps/web, apps/mobile, packages/design-system, packages/shared), outillage, scripts, base PostgreSQL locale, premières migrations.
> 2. Le système de design en code : jetons depuis tokens.json, les quinze composants en React et React Native, les deux thèmes, le mouvement.
> 3. Le parcours n° 1 de bout en bout : page événement → candidater → tri → retenu → accès → jour J → scan staff hors ligne → points, sur le site et dans l'appli.
> 4. Puis le site public et la création d'événement, puis les pros et la billetterie en mode présentation.
>
> Les règles sont dans CLAUDE.md : ce que les docs tranchent, tu l'appliques ; ce qu'ils ne disent pas, tu choisis le plus simple et tu le notes dans docs/JOURNAL-DES-CHOIX.md. Tu ne me poses une question que si c'est bloquant, une à la fois, avec ta réponse par défaut. Tu tiens AVANCEMENT.md à jour pour reprendre d'une session à l'autre. Commence.

## 3. Ce qui va se passer

Une seule session ne suffira pas à tout construire : Claude Code s'arrêtera quand son contexte sera plein. C'est normal. Relancer `claude` et dire « Lis CLAUDE.md et AVANCEMENT.md, continue là où tu t'es arrêté » : il reprend sans que tu aies rien à réexpliquer.

Quand tu veux faire le point, lire `AVANCEMENT.md` et `docs/JOURNAL-DES-CHOIX.md`, puis ramener ici ce qui mérite d'entrer dans les documents de conception.
