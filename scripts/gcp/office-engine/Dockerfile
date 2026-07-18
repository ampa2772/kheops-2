FROM mirror.gcr.io/collabora/code@sha256:df33af88c59e26b7335ea98d91e65f1edf13f33369ce6115941b8d59d3409cb5

# Collabora 26.04 interprète actuellement toute valeur non vide de darkTheme
# comme « true » dans le navigateur. Le correctif conserve l'image officielle
# épinglée et ne remplace que cette condition : true ET false deviennent des
# valeurs explicites, également synchronisées dans le stockage du moteur.
USER root
RUN set -eux; \
    files="$(find /usr/share/coolwsd/browser -type f -name global.js)"; \
    test -n "$files"; \
    for file in $files; do \
      sed -i 's/else s\&\&(window\.uiDefaults={darkTheme:"true"})/else if(s==="true"||s==="false"){try{window.localStorage.setItem("darkTheme",s)}catch{}window.uiDefaults={darkTheme:s}}/' "$file"; \
    done; \
    ! grep -R -F 'else s&&(window.uiDefaults={darkTheme:"true"})' /usr/share/coolwsd/browser; \
    grep -R -F 'window.localStorage.setItem("darkTheme",s)' /usr/share/coolwsd/browser

# L'image officielle s'exécute sous ce compte non privilégié. L'élévation
# ci-dessus reste strictement limitée à la fabrication de la couche corrigée.
USER cool
