export const MAX_RETRIES = 2;

export const PROMPTS = {
  GREETING: '<prosody rate="medium" pitch="medium">Guten Tag. <break time="400ms"/> Willkommen beim Stadtwerk.</prosody>',
  MENU_SELECTION: '<prosody rate="medium">Drücken Sie 1 oder sagen Sie "Zählerstand" für Zählerstandsmeldung. <break time="500ms"/> Drücken Sie 2 oder sagen Sie "Mitarbeiter" um mit einem Mitarbeiter verbunden zu werden.</prosody>',
  REQUEST_CUSTOMER_NUMBER: '<prosody rate="medium">Bitte nennen Sie Ihre Kundennummer.</prosody>',
  REQUEST_METER_NUMBER: '<prosody rate="medium">Bitte nennen Sie Ihre Zählernummer.</prosody>',
  REQUEST_READING: '<prosody rate="medium">Bitte nennen Sie Ihren aktuellen Zählerstand.</prosody>',
  INVALID_CUSTOMER: '<prosody rate="medium">Diese Kundennummer ist mir nicht bekannt. <break time="300ms"/> Bitte nennen Sie Ihre Kundennummer erneut.</prosody>',
  INVALID_METER: '<prosody rate="medium">Diese Zählernummer passt nicht zu Ihrer Kundennummer. <break time="300ms"/> Bitte nennen Sie Ihre Zählernummer erneut.</prosody>',
  CONFIRMATION: '<prosody rate="medium">Vielen Dank! <break time="400ms"/> Ihr Zählerstand wurde gespeichert. <break time="300ms"/> Auf Wiederhören.</prosody>',
  MAX_RETRIES_EXCEEDED: '<prosody rate="slow">Leider konnte ich Ihre Angaben nicht verstehen. <break time="500ms"/> Bitte rufen Sie später noch einmal an. <break time="300ms"/> Auf Wiederhören.</prosody>',
  UNCLEAR_INPUT: '<prosody rate="medium">Entschuldigung, <break time="200ms"/> ich habe Sie nicht verstanden. <break time="300ms"/> Bitte wiederholen Sie Ihre Angabe.</prosody>'
};
