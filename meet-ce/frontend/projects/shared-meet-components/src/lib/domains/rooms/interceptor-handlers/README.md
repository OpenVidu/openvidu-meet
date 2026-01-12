# Interceptor Handlers - Rooms Domain

Este directorio contiene los handlers que gestionan la lógica de dominio relacionada con errores HTTP de room members.

## Propósito

Separar la lógica de negocio del interceptor HTTP principal, siguiendo el principio de responsabilidad única y la arquitectura de dominios.

## Componentes

### `RoomMemberErrorHandlerService`

Servicio responsable de manejar errores 401 relacionados con tokens de room member expirados.

**Responsabilidades:**
- Refrescar el room member token cuando expira
- Reintrentar la petición original con el nuevo token
- Obtener el contexto necesario (roomId, secret, participant info)

**NO es responsable de:**
- Decidir cuándo debe ejecutarse (eso lo hace el interceptor)
- Conocer sobre access tokens (eso es del dominio auth)
- Agregar headers a las peticiones (eso lo hace el interceptor)

## Arquitectura

```
HTTP Interceptor (detecta error 401 en página /room/*)
    ↓
    Notifica → HttpErrorNotifierService
    ↓
    Decide qué handler ejecutar según contexto
    ↓
RoomMemberErrorHandlerService.createRetryStrategy()
    ↓
    Ejecuta lógica de dominio (refresh room member token)
    ↓
    Retorna Observable para reintentar la petición
```

## Uso

El servicio se inyecta automáticamente en el interceptor HTTP y se invoca cuando:
- Se recibe un error 401
- Estamos en una página que empieza con `/room/`
- No es una petición al endpoint `/profile`
- No es un error al generar el token (endpoint `/token`)
