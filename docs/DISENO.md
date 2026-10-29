# Diseño visual — Gumball Chat

## Idea

Una máquina de dulcería de barrio, recién pulida y llena de caramelos que vienen del chat. La esfera de vidrio y el papel de la fortuna son los protagonistas; la interfaz del streamer funciona como una caja registradora clara y discreta.

## Paleta

| Uso | Color |
|---|---|
| Jade de la máquina | `#0F7C6E` |
| Jade en sombra | `#07564E` |
| Jade iluminado | `#53AA91` |
| Cromo | `#DCE7E4` |
| Papel cálido | `#FFF6D7` |
| Tinta | `#25231F` |
| Pista limón | `#FFD23F` |
| Spoiler regaliz sellado | `#1E1B24` |
| Predicción uva | `#8A5CF6` |
| Ánimo chicle | `#FF6FB5` |
| Reto mandarina | `#FF5A36` |
| Destacada dorada | `#F8B735` |

## Tipografía

- **Bagel Fat One**, local: nombre de la máquina y titulares breves con carácter de cartel pintado.
- **Bricolage Grotesque**, local: controles, mensajes, autores y texto de lectura. Su peso regular mantiene legible la interfaz en directo.

## Bocetos

```text
OVERLAY OBS (transparente; máquina anclada a una esquina)
+-------------------------------------------------------+
|                                                       |
|                                  .----------------.   |
|                                 /   vidrio curvo   \  |
|                                |   ● ● ● ● ● ●     | |
|                                |    ● ● ● ●        | |
|                                 \_________________/  |
|                                  [Gumball Chat]       |
|                               jade / manivela / rampa  |
|                                      papel abierto     |
+-------------------------------------------------------+

PANEL (papel claro; acciones a mano y cola fácil de leer)
+-------------------------------------------------------+
| Gumball Chat       Sesión y conexión                  |
| Bolitas: todas | pista | spoiler | predicción | ...  |
| @autor  texto traducido                 Ver original  |
| [máquina de mensajes]       [Sacar una bolita]        |
| idiomas de esta sesión       [Revelación final]       |
+-------------------------------------------------------+
```

## Principios

- La máquina debe leerse como una esfera real sobre una pieza de metal fundido, no como un panel con una ilustración dentro.
- El jade y el cromo forman una silueta reconocible; el color de cada caramelo comunica su categoría sin depender solo del texto.
- La revelación tiene una secuencia corta y legible: giro, salida, apertura y papel. El papel permanece el tiempo suficiente para leerlo.
- El overlay deja el centro del juego despejado y no pinta un fondo opaco sobre OBS.
- El movimiento ocurre al llegar, filtrar o abrir mensajes. En reposo la máquina queda quieta; se respeta la preferencia de movimiento reducido.
- El panel prioriza la cola, el filtro y la acción. Usa frases directas, contraste alto, estados que indican cómo continuar y foco de teclado visible.
