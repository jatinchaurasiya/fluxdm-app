
import { Jimp } from 'jimp';
import png2icons from 'png2icons';
import fs from 'fs';

async function generate() {
    try {
        console.log("Reading image...");
        const image = await Jimp.read('build/icon.png');

        console.log("Resizing...");
        image.resize({ w: 512, h: 512 });

        console.log("Getting buffer...");
        const buffer = await image.getBuffer("image/png");

        console.log("Creating ICO...");
        const ico = png2icons.createICO(buffer, png2icons.HERMITE, 0, false);
        if (ico) {
            fs.writeFileSync('build/icon.ico', ico);
            console.log('Created build/icon.ico');
        } else {
            console.error('Failed to create .ico - png2icons returned null');
        }

        console.log("Creating ICNS...");
        const icns = png2icons.createICNS(buffer, png2icons.BILINEAR, 0);
        if (icns) {
            fs.writeFileSync('build/icon.icns', icns);
            console.log('Created build/icon.icns');
        } else {
            console.error('Failed to create .icns - png2icons returned null');
        }
    } catch (error) {
        console.error("Error processing image:", error);
    }
}

generate();
