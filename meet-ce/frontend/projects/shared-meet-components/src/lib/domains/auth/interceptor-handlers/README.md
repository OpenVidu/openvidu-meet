# Interceptor Handlers - Auth Domain

Este directorio contiene los handlers que gestionan la lógica de dominio relacionada con errores HTTP de autenticación.

## Propósito

Separar la lógica de negocio del interceptor HTTP principal, siguiendo el principio de responsabilidad única y la arquitectura de dominios.

## Componentes

### `AuthErrorHandlerService`

Servicio responsable de manejar errores 401 relacionados con tokens de acceso expirados.

**Responsabilidades:**
- Refrescar el access token cuando expira
- Reintrentar la petición original con el nuevo token
- Manejar errores de refresh token (logout si es necesario)

**NO es responsable de:**
- Decidir cuándo debe ejecutarse (eso lo hace el interceptor)
- Conocer sobre tokens de room members (eso es del dominio rooms)
- Agregar headers a las peticiones (eso lo hace el interceptor)

## Arquitectura

```
HTTP Interceptor (detecta error 401)
    ↓
    Notifica → HttpErrorNotifierService
    ↓
    Decide qué handler ejecutar según contexto
    ↓
AuthErrorHandlerService.createRetryStrategy()
    ↓
    Ejecuta lógica de dominio (refresh token)
    ↓
    Retorna Observable para reintentar la petición
```

## Uso

El servicio se inyecta automáticamente en el interceptor HTTP y se invoca cuando:
- Se recibe un error 401
- No es un error de token de room member
- No estamos en la página de login O existe un refresh token disponible
