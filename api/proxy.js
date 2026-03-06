// JS DO SERVIDOR (NODE.JS)
export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) return res.status(400).send("Cadê a URL?");

    try {
        // O Vercel faz a requisição por você (fora da rede da escola)
        const response = await fetch(url);
        const content = await response.text();

        // Devolve o site para o seu celular
        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(content);
    } catch (e) {
        res.status(500).send("Erro ao burlar: " + e.message);
    }
}