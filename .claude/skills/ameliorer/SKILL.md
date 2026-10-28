---
name: ameliorer
description: Mène de bout en bout une amélioration de Mon patrimoine (comprendre, examiner, modifier, vérifier, relire, bilan), sans commit ni publication.
argument-hint: "[ma demande]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(node --test:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git branch:*), Bash(git switch -c:*), Bash(git fetch:*), Bash(py -m http.server:*)
---

# Amélioration complète

Demande de l'utilisateur : **$ARGUMENTS**

Si la demande est vide, demande en une phrase ce qu'il faut améliorer, puis arrête-toi.

Suis les règles de `CLAUDE.md`, en particulier « Protection des données » et « Publication et Git ». Travaille d'un trait jusqu'au bilan.
- **Choix ordinaires** (nom de fonction, texte d'un message, emplacement d'un bouton, structure d'un test) : décide toi-même et signale-le dans le bilan.
- **Quand t'arrêter pour demander :**
  - un changement de clé ou de format des données, une nouvelle clé stockée, une suppression de données ou de PDF ;
  - toute action de publication ;
  - une demande ambiguë dont les deux lectures mènent à des changements très différents.
- **Commandes :** lance-les avec l'outil Bash (tests, `git status`, `git diff`, etc.). Elles sont autorisées pour ce skill, sans confirmation.

## 1. Comprendre
- Reformule la demande pour toi en une phrase : le résultat attendu pour l'utilisateur, et ce qui ne doit pas changer.
- Repère ce qu'elle touche : données enregistrées, PDF, Web, Windows, Android.

## 2. Préparer la branche
- Lance `git status --short --branch`.
- **Modifications non commitées sans rapport avec la demande** (hors `AUDIT_MON_PATRIMOINE.md`) : arrête-toi. Indique ce qui est en cours et demande s'il faut continuer sur cette branche ou attendre. Ne les mets jamais de côté (stash) et ne les écrase jamais toi-même.
- **Sur `main` sans modification :** `git fetch`, vérifie que `main` est à jour avec `origin/main`, puis `git switch -c amelioration/<sujet-court>`.
- **Déjà sur une branche `amelioration/…` liée à la demande :** continue dessus.

## 3. Examiner le code nécessaire
- Cherche avec Grep, puis lis les fonctions concernées et **tous leurs appels**. Ne lis pas tout `app.js` sans raison.
- Vérifie les points de `CLAUDE.md` qui s'appliquent : les 4 endroits pour un nouveau fichier JS, le `CACHE` de `sw.js`, les blocs testables entre marqueurs, les écritures qui peuvent échouer.
- Quand c'est possible à peu de frais, confirme un problème supposé avant de le corriger, par exemple avec un petit script Node dans le dossier temporaire de la session.

## 4. Réaliser le changement
- Changement minimal, dans le style du code existant. Rien d'autre que la demande : note les autres problèmes vus pour le bilan, sans les corriger.
- Place la logique nouvelle testable dans un bloc entre marqueurs (`/*NOM-START*/ … /*NOM-END*/`).
- Incrémente `CACHE` dans `sw.js` si un fichier servi change.

## 5. Vérifier
- **Comportement modifié :** ajoute ou adapte les tests dans `tests/`, avec des données fictives. Couvre le cas normal **et** les cas d'échec (stockage plein, fichier abîmé…).
- **Tests :** lance `node --test tests/*.test.js`. Tous doivent passer, anciens compris.
- **Code de protection** (sauvegarde, import, écriture) : casse volontairement une protection à la fois, sur une copie hors du projet, pour vérifier qu'un test échoue.
- **Changement visible à l'écran :** essaie dans Chrome.
  - Lance un serveur local sur un port libre (outil Bash en arrière-plan), puis charge le skill claude-in-chrome.
  - Utilise des données fictives et regarde la console.
  - À la fin : nettoie le stockage de l'adresse de test, ferme l'onglet et arrête le serveur.
- **Ne relance une vérification que si quelque chose a changé depuis.** Pas de seconde exécution identique « pour être sûr ».

## 6. Relire
Relis `git diff` en entier, et les fichiers nouveaux, avec cette liste :
- [ ] le format JSON, la clé `patrimoine-app` et les PDF sont intacts, ou le changement a été accepté ;
- [ ] un échec d'écriture est signalé et les données affichées restent exportables ;
- [ ] les anciens exports restent importables ;
- [ ] Web, Windows et Android : rien de propre à une plateforme n'est cassé (`window.patrimoineDesktop`, `window.Capacitor`, copie dans `desktop/` et `mobile/`) ;
- [ ] `CACHE` incrémenté, et les 4 endroits pour tout nouveau fichier ;
- [ ] aucune donnée personnelle, aucun fichier hors sujet, fins de ligne cohérentes.

Corrige ce que la relecture révèle, puis relance les tests concernés.

## 7. Bilan court (en français)
Dans cet ordre, en quelques lignes :
1. **Le résultat**, en une phrase simple.
2. **Les fichiers modifiés**, et les choix faits sans demander.
3. **Les vérifications faites et leur résultat**, puis ce qui n'a pas été vérifié (par exemple Windows ou Android sur appareil).
4. **Les limites ou les problèmes vus à côté.**
5. **La suite possible** en une ligne (fichier de revue, installateurs de test, PR), **sans la lancer**.

Aucun commit, push, PR, fusion ou lancement de workflow sans demande explicite. La publication reste soumise à l'accord de l'utilisateur.
