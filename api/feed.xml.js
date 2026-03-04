export default async function handler(req, res) {

const apiUrl = "https://my.ultegra.net/service/stokService/NTg1NTRM?aciklama=0&size=100&page=0";
const sitemapUrl = "https://www.thekitapyayinlari.com/sitemap/product.xml";

// Ultegra ürünlerini çek
const apiResponse = await fetch(apiUrl);
const apiData = await apiResponse.json();

const products = apiData.data || [];

// Sitemap çek
const sitemapResponse = await fetch(sitemapUrl);
const sitemapText = await sitemapResponse.text();

// sitemap içinden linkleri çıkar
const links = [...sitemapText.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);

let items = "";

products.forEach(p => {

const id = p.barkod || p.stokid || "";
const title = p.stokad || "";
const priceRaw = Number(p.indirimlifiyat || p.psf || 0);
const price = priceRaw.toFixed(2);

const stock = Number(p.miktar || 0);
const availability = stock > 0 ? "in_stock" : "out_of_stock";

let image = "";
if (p.resimler && p.resimler.length > 0) {
image = p.resimler[0].replace(/\\/g, "");
}

const brand = p.marka || "The Kitap";

// sitemap içinde ürün linki bul
let productLink = "";

links.forEach(link => {
if (link.toLowerCase().includes(title.toLowerCase().replace(/ /g,"-"))) {
productLink = link;
}
});

// fallback
if(!productLink){
productLink = "https://www.thekitapyayinlari.com";
}

items += `
<item>
<g:id>${id}</g:id>
<g:title><![CDATA[${title}]]></g:title>
<g:description><![CDATA[${title}]]></g:description>
<g:link>${productLink}</g:link>
<g:image_link>${image}</g:image_link>
<g:availability>${availability}</g:availability>
<g:price>${price} TRY</g:price>
<g:brand>${brand}</g:brand>
<g:gtin>${id}</g:gtin>
<g:condition>new</g:condition>
</item>
`;

});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>The Kitap Merchant Feed</title>
<link>https://www.thekitapyayinlari.com</link>
<description>Ultegra otomatik ürün feed</description>
${items}
</channel>
</rss>`;

res.setHeader("Content-Type", "application/xml");
res.status(200).send(xml);

}
