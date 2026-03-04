export default async function handler(req, res) {
const API_BASE = "https://my.ultegra.net/service/stokService/NTg1NTRM?aciklama=0&size=100&page=";
const SITEMAP_URL = "https://www.thekitapyayinlari.com/sitemap/product.xml";

// 1. önce ilk sayfayı çekip toplam sayfa sayısını öğrenebiliriz.. ilk sayfa seri sonrası paralel gelecek
let firstData;
try {
const firstRes = await fetch(API_BASE + "0");
if (!firstRes.ok) throw new Error(`API HTTP ${firstRes.status}`);
firstData = await firstRes.json();
} catch (err) { // testlerden sonra konsol error u kaldırabilirsiniz.. aşağıdaki yapı için de geçerli
console.error("API ilk sayfa hatası:", err);
return res.status(502).json({ error: "Ürün APIsine ulaşılamadı." });
}

const totalPage = Number(firstData?.totalPage) || 1;

// 2. kalan sayfaları paralel çekebiliriz
const remainingPages = Array.from({ length: totalPage - 1 }, (_, i) => i + 1);

const pageResults = await Promise.allSettled( // sonraki sayfalar paralel çeklsin
remainingPages.map(async (page) => {
const res = await fetch(API_BASE + page);
if (!res.ok) throw new Error(`Sayfa ${page}: HTTP ${res.status}`);
return res.json();
})
);

const allProducts = [
...(firstData?.data || []), // ilk sayfanın ürünlerini açıp eklesin
...pageResults.flatMap((r) => // diğer sayfaların ürünlerini açıp eklesin
r.status === "fulfilled" ? r.value?.data || [] : []
),
];

// başarısız sayfaları loglasın ama devam etsin
pageResults.forEach((r, i) => {
if (r.status === "rejected")
console.warn(`Sayfa ${i + 1} alınamadı:`, r.reason);
});

// 3. sitemapi çeksin
let sitemapLinks = [];
try {
const sitemapRes = await fetch(SITEMAP_URL);
if (!sitemapRes.ok) throw new Error(`Sitemap HTTP ${sitemapRes.status}`);
const sitemapText = await sitemapRes.text();
sitemapLinks = [...sitemapText.matchAll(/<loc>(.*?)<\/loc>/g)].map(
(m) => m[1]
);
} catch (err) {
// sitemap olmasa da feed üretmeye devam etsin, linkler boş kalıcak
console.warn("Sitemap alınamadı:", err);
}

// 4. eklemeler

// xml injection için eklenebilir
function escapeXml(str) {
return String(str ?? "")
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&apos;");
}

// Türkçe dahil slug böyle olabilir
function toSlug(str) {
return String(str)
.toLowerCase()
.replace(/[çÇ]/g, "c")
.replace(/[ğĞ]/g, "g")
.replace(/[ıİ]/g, "i")
.replace(/[öÖ]/g, "o")
.replace(/[şŞ]/g, "s")
.replace(/[üÜ]/g, "u")
.replace(/[âÂ]/g, "a")
.replace(/[îÎ]/g, "i")
.replace(/[ûÛ]/g, "u")
.replace(/[^a-z0-9 ]/g, "")
.trim()
.replace(/\s+/g, "-");
}

// 5. feed itemlarını oluştur
const items = allProducts
.map((p) => {
const title = p.stokad || "";

// böyle daha güvenilir, deterministik ID - random() kullanılmasa daha iyi olur
const id = escapeXml(p.barkod || p.stokkod || p.stokid || "");
if (!id) return ""; // ID yoksa ürünü atlasın

const gtin = escapeXml(p.barkod || "");
const priceRaw = Number(
  String(p.indirimlifiyat || p.psf || 0).replace(",", ".")
const price = priceRaw.toFixed(2);
const stock = Number(p.miktar || 0);
const availability = stock > 0 ? "in_stock" : "out_of_stock";
const image = escapeXml(
p.resimler?.length ? p.resimler[0].replace(/\\/g, "") : ""
);
const brand = escapeXml(p.marka || "The Kitap");
const productType = escapeXml(p.kategori || "Kitap");

// slug eşleştirmesi böyle olabilr (sonunda slug veya slug/ olması lazım)
let productLink = "";
if (title) {
const slug = toSlug(title);
productLink =
sitemapLinks.find((link) =>
new RegExp(`/${slug}(/|$)`).test(link) //slug yerine regex kullanılabilir
) || "";
}

return `
<item>
<g:id>${id}</g:id>
<g:title><![CDATA[${title}]]></g:title>
<g:description><![CDATA[${title}]]></g:description>
<g:link>${escapeXml(productLink)}</g:link>
<g:image_link>${image}</g:image_link>
<g:availability>${availability}</g:availability>
<g:price>${price} TRY</g:price>
<g:brand>${brand}</g:brand>
<g:gtin>${gtin}</g:gtin>
<g:condition>new</g:condition>
<g:google_product_category>784</g:google_product_category> <!-- araya fazla boşluk küçük harf veya farklı karakter girerse eski kod reddedilebilir.. google kitap kategorisi 784 sanırım.. medya - kitaplar olması lazım.. bunu bir dener misiniz. -->
<g:product_type>${productType}</g:product_type>
</item>`;
})
.join("");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>The Kitap Merchant Feed</title>
<link>https://www.thekitapyayinlari.com</link>
<description>Ultegra otomatik ürün feed</description>
${items}
</channel>
</rss>`;

res.setHeader("Content-Type", "application/xml; charset=utf-8");

res.status(200).send(xml);
}
