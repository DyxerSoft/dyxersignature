# Verification feature

La pantalla invoca la verificación autenticada de la API, que recalcula SHA-256 sobre los bytes guardados en SeaweedFS y consulta la transacción Stellar asociada. El frontend presenta coincidencia del archivo y resultado de red; no trata un transaction hash sin confirmación como verificado.

