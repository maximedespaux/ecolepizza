# RUNBOOK — Impastio en production

Aide-mémoire d'exploitation du serveur. Tout se fait en SSH sur le VPS :

```bash
ssh -i ~/.ssh/impastio_vps ubuntu@92.222.90.76
```

`sudo` ne demande pas de mot de passe sur cette machine.

> **Avant de paniquer.** Les trois services sont en `Restart=always` : s'ils plantent, systemd
> les relance seul en ~5 secondes. La plupart des « pannes » sont déjà réparées quand on se
> connecte. Le manuel ci-dessous sert quand l'auto-réparation ne suffit pas (config cassée,
> disque plein) ou qu'on veut forcer les choses.

---

## Le réflexe unique

```bash
sudo impastio-etat            # diagnostic seul, ne touche à rien
sudo impastio-etat --relancer # diagnostique PUIS relance base → API → nginx, et vérifie
```

`impastio-etat` contrôle, dans l'ordre où les pannes arrivent : disque, mémoire, services,
ports, la chaîne base → API → nginx → Internet, le certificat, les sauvegardes. Le premier
maillon rouge est la cause ; les suivants n'en sont que les conséquences.

---

## Les trois services

| | Rôle | Écoute |
|---|---|---|
| `impastio-api` | l'API Node/Express | `127.0.0.1:3000` (jamais exposée) |
| `nginx` | sert le front + proxifie `/api` | `80` / `443` |
| `mariadb` | la base de données | `127.0.0.1:3306` (jamais exposée) |

### Redémarrer

```bash
sudo systemctl restart impastio-api
sudo systemctl restart nginx
sudo systemctl restart mariadb
```

### Arrêter (« tuer ») — ET LE PIÈGE À CONNAÎTRE

```bash
sudo systemctl stop impastio-api
```

⚠️ **Ne jamais utiliser `kill <pid>` pour arrêter un de ces services.** Comme ils sont en
`Restart=always`, systemd voit le processus mourir, croit à un plantage, et le **relance
aussitôt** — impossible de le tuer ainsi. Seul `systemctl stop` dit à systemd « qu'il reste
arrêté ». Pour le rallumer :

```bash
sudo systemctl start impastio-api
```

### État et démarrage automatique

```bash
systemctl is-active impastio-api   # active / inactive / failed
systemctl status impastio-api      # détail + dernières lignes de journal
```

Les trois sont `enabled` : ils redémarrent au boot de la machine.

### Redémarrer la machine entière

```bash
sudo reboot
```

Tout revient seul après ~30 s (services `enabled`). La session SSH tombe le temps du reboot.

---

## Voir POURQUOI ça a planté

Toujours regarder avant de relancer en aveugle — sinon on risque une boucle.

```bash
sudo journalctl -u impastio-api -n 50 --no-pager   # 50 dernières lignes
sudo journalctl -u impastio-api -f                 # en direct (Ctrl-C pour sortir)
sudo journalctl -u impastio-api --since "-1 hour" -p err   # erreurs de la dernière heure
```

Causes fréquentes : base injoignable (regarder `mariadb`), disque plein (`df -h /`), erreur de
configuration après un déploiement (regarder les premières lignes au démarrage).

---

## Déployer une mise à jour

Le serveur suit la branche **`main`**. Le front se construit **sur le Mac**, jamais sur le VPS.

### L'API (sur le VPS)

```bash
cd /opt/impastio
git pull
cd src/api
npm ci --ignore-scripts --omit=dev
sudo systemctl restart impastio-api
```

- `npm ci` (et non `install`) installe **exactement** le fichier de verrouillage — aucune montée
  de version en douce.
- `--ignore-scripts` ferme le vecteur des scripts `postinstall` (celui des vers npm). `bcrypt`
  fonctionne sans, son binaire Linux est livré dans le paquet.

### Le front (sur le Mac, puis envoi)

```bash
cd src/app
VITE_API_URL=/api npm run build
rsync -az --delete -e "ssh -i ~/.ssh/impastio_vps" dist-react/ ubuntu@92.222.90.76:/var/www/impastio.com/
```

⚠️ **`VITE_API_URL=/api` est obligatoire à chaque build.** L'oublier recuit `localhost:3000`
dans le paquet, et l'application casse en silence (le build passe quand même).

---

## Sauvegardes

Automatiques chaque nuit à 3h20 (timer systemd), 14 jours de rétention, dans
`/var/backups/impastio/`. **Un seul dump suffit à tout sauver** : l'application ne pose aucun
fichier sur le disque, tout (pièces, images, PDF) est en base.

```bash
sudo systemctl start impastio-sauvegarde        # en déclencher une maintenant
ls -lh /var/backups/impastio/                    # lister
```

### Rapatrier une copie sur le Mac (à faire régulièrement — sinon tout est sur un seul disque)

```bash
ssh -i ~/.ssh/impastio_vps ubuntu@92.222.90.76 'sudo bash -c "cat \$(ls -1t /var/backups/impastio/*.sql.gz | head -1)"' > ~/Documents/impastio-$(date +%F).sql.gz
gzip -t ~/Documents/impastio-$(date +%F).sql.gz && echo OK && gzcat ~/Documents/impastio-$(date +%F).sql.gz | grep -c '^CREATE TABLE'   # doit afficher OK puis 85
```

### Restaurer un dump (en cas de désastre)

```bash
# ⚠ ÉCRASE la base cible. Vérifier le fichier avant.
zcat /var/backups/impastio/FICHIER.sql.gz | sudo mariadb --max-allowed-packet=256M impastio
```

---

## Accès à la base (consultation)

Jamais exposée : on passe par un tunnel SSH.

```bash
sudo mariadb impastio                            # en ligne de commande, sur le VPS
```

Depuis un client graphique (DBeaver, TablePlus) sur le Mac : onglet SSH → `92.222.90.76`,
utilisateur `ubuntu`, clé `~/.ssh/impastio_vps`, port 22 ; puis base sur `127.0.0.1:3306`,
utilisateur `impastio`, mot de passe = `sudo cat /root/.impastio-db`.

---

## Certificat HTTPS

Let's Encrypt, renouvellement automatique (timer certbot), couvre les 4 noms
(`impastio.com`, `www`, `impastio.fr`, `www`).

```bash
sudo certbot certificates          # dates d'expiration
sudo certbot renew                 # forcer un renouvellement (rare)
```

---

## Chemins utiles

| Quoi | Où |
|---|---|
| Code de l'API | `/opt/impastio/src/api` |
| Configuration (secrets) | `/opt/impastio/src/api/config/.env` (600, utilisateur `impastio`) |
| Front servi | `/var/www/impastio.com` |
| Données MariaDB | `/var/lib/mariadb/impastio` |
| Sauvegardes | `/var/backups/impastio` |
| Config nginx | `/etc/nginx/sites-available/impastio.com` |
| Service API | `/etc/systemd/system/impastio-api.service` |
| Diagnostic | `/usr/local/sbin/impastio-etat` |

---

## Si le site semble inaccessible mais que le serveur va bien

`sudo impastio-etat` dit « Tout est en ordre » mais le site ne s'ouvre pas depuis un poste ?
La cause est **locale** à ce poste (cache DNS, réseau, navigateur), pas le serveur. Vérifier
de là-bas :

```bash
dig impastio.com                       # doit renvoyer 92.222.90.76
curl -I https://impastio.com           # doit renvoyer 200/301
```

Sur macOS, vider le cache DNS local : `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder`.
