export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send("Por favor, insira uma URL válida.");
    }

    try {
        const targetUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
        
        // Faz a requisição fingindo ser um navegador real
        const response = await fetch(targetUrl.href, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            }
        });

        let html = await response.text();

        // MÁGICA DO JAVASCRIPT:
        // Esse código procura por caminhos que começam com "/" (relativos)
        // e troca pelo endereço completo do site (absolutos).
        // Isso faz o JS, CSS e Imagens carregarem de verdade.
        const origin = targetUrl.origin;
        html = html.replace(/(src|href|action)="\/(?!\/)/g, `$1="${origin}/`);
        html = html.replace(/(src|href|action)='\/(?!\/)/g, `$1='${origin}/`);

        // Adiciona um pequeno script para tentar burlar bloqueios de iframe
        const buster = `
            <script>
                // Impede que o site saia do seu iframe
                window.onbeforeunload = function() { return false; };
            </script>
        `;
        html = html + buster;

        res.setHeader('Content-Type', 'text/html');
        // Permite que o JS do site original tente rodar
        res.setHeader('Access-Control-Allow-Origin', '*'); 
        res.status(200).send(html);

    } catch (error) {
        res.status(500).send("Erro ao processar a página: " + error.message);
    }
}
