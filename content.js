// ─── CONTENT.JS ─────────────────────────────────────────────────────────────
// Edit the text here to update anything visible on the website.
// Do not change key names (the parts before the colon).
// ─────────────────────────────────────────────────────────────────────────────

const CONTENT = {

  // ── Navigation ──────────────────────────────────────────────────────────────
  nav: {
    logo:     "Berkeley Skuratowicz",
    projects: "Projects",
    about:    "About"
  },

  // ── Homepage Hero ────────────────────────────────────────────────────────────
  hero: {
    label:   "Selected Works",
    count:   "08 Projects",
    heading: "SELECTED<br>WORKS.",        // <br> creates the line break
    divider: "Engineering & Design / 2020–2026"
  },

  // ── Projects ─────────────────────────────────────────────────────────────────
  // Each project has: number, tags (list), title, description,
  //                   institution, year, readMore (list of paragraphs)
  projects: {

    nutrisync: {
      number:      "01",
      tags:        ["Product Design", "Electronics", "Raspberry Pi"],
      title:       "NutriSync",
      description: "An automated add-on system that monitors and doses water and nutrients for small-scale consumer hydroponic gardens, removing the guesswork from home growing.",
      institution: "SF State University",
      year:        "2026",
      readMore: [
        "NutriSync is an automated add-on system that monitors and doses water and nutrients for small-scale consumer hydroponic gardens. A sensor pod reads the reservoir while a Raspberry Pi controller runs the pumps, removing the guesswork and the regular maintenance that most home hydroponic systems still require.",
        "The design grew out of a survey of hydroponic gardeners, interviews with experts in food growing, hardware engineering, and hydroponic retail, and contextual analysis of where gardens are placed in homes. It was developed through sketching, multiple rounds of CAD and physical prototyping, ongoing feedback from advisors and peers, and bench testing of the final working system. The project covered research, hardware, software, industrial design, and user interface design end to end."
      ]
    },

    bike: {
      number:      "02",
      tags:        ["Engineering", "Manufacturing", "Capstone"],
      title:       "Carbon Fiber Mountain Bike",
      description: "A full-suspension mountain bike built from recycled wood and carbon fiber composite, designed for Celilo Cycles as a six-month senior capstone project.",
      institution: "Oregon State University",
      year:        "2022",
      readMore: [
        "For my senior capstone project, I worked with four engineering students over six months to design and build a full-suspension mountain bike using recycled wood and carbon fiber composite. The goal was to create a bike for Celilo Cycles that could handle rugged terrain while maintaining the aesthetics of a cross-country bike. We developed a design that optimized the frame geometry for performance and durability, which will be added to Celilo Cycles' product lineup.",
        "My role included researching and determining the frame geometry, creating a cardboard prototype, and building the initial wooden prototype. I also contributed to refining the second wooden prototype, 3D-printing small components for accurate sizing, and assisting with project reports. Our team CNC-milled the wooden frame, laid up carbon fiber, and assembled the bike, producing two final prototypes tested for safety and performance.",
        "The project was showcased at the Oregon State University 2022 Engineering Exposition and received an award from Daimler Trucks North America for its innovative potential. This experience gave me practical skills in design, manufacturing, and teamwork."
      ]
    },

    interlock: {
      number:      "03",
      tags:        ["Industrial Design", "Community", "PlayfulSF"],
      title:       "Interlock Building Blocks",
      description: "A large-scale interlocking building system designed for PlayfulSF to bring unstructured, collaborative play to urban spaces.",
      institution: "PlayfulSF",
      year:        "2025",
      readMore: [
        "I designed a large-scale building system for PlayfulSF to reintroduce unstructured play into the urban landscape. The system uses life-sized, interlocking components that invite collaborative play at any age.",
        "From initial ideation and sketching to final 3D modeling, I developed a kit of parts that balances geometric simplicity with structural integrity. The result is a tactile, ever-changing installation that invites passersby to stop and collaborate on large-scale sculptures."
      ]
    },

    robot: {
      number:      "04",
      tags:        ["Engineering", "Arduino", "Robotics"],
      title:       "Rhythm Robot",
      description: "A sound-reactive dancing robot that responds to music in real time using FFT beat detection, servo motors, and dynamic LED patterns.",
      institution: "Oregon State University",
      year:        "2021",
      readMore: [
        "I built a sound-reactive dancing robot at Oregon State University that responds to music in real time. Using FFT beat detection, servo motors, and dynamic LED patterns, the robot translates amplitude and frequency into movement and light.",
        "The robot used a SparkFun Sound Detector to measure sound amplitude and frequency, triggering changes in LED colors, flashing patterns, and dance movements via four servo motors. I implemented a fast Fourier transform (FFT) function using EasyFFT to filter noise, detect beats, and identify common frequencies.",
        "I 3D-printed the robot's body, set up the sound sensor, wrote all FFT and beat detection code, and designed a support system for the breadboard and Arduino to allow controlled movement."
      ]
    },

    lumaire: {
      number:      "05",
      tags:        ["Product Design", "Consumer Goods", "3D Modeling"],
      title:       "Lumaire Nightstand",
      description: "A nightstand designed for busy parents, combining touch-controlled lighting, motion-activated floor lights, and child-safe rounded edges.",
      institution: "SF State University",
      year:        "2024",
      readMore: [
        "The Lumaire Nightstand was designed to meet the needs of a busy parent caring for a young child. The design aimed to address common challenges like clutter, harsh lighting, and safety concerns while providing functional and user-friendly features.",
        "To meet these needs, I designed the nightstand with touch-controlled LED lights for adjustable brightness, making it easy to operate without disturbing sleep. The motion-activated floor lights provide illumination for nighttime movement, reducing the risk of accidents. The smooth, rounded edges ensure safety for children, while soft-close drawers prevent noise during use. A spacious top surface accommodates essential items like phones and watches, and the enclosed storage keeps the area organized and clutter-free."
      ]
    },

    tumbler: {
      number:      "06",
      tags:        ["Engineering", "Internship", "SLA Prototyping"],
      title:       "Rock Tumbler Mount",
      description: "A housing and motor mount designed during my internship at Blue Marble, validated with an SLA 3D-printed prototype.",
      institution: "Blue Marble - Internship",
      year:        "2022",
      readMore: [
        "During my internship at Blue Marble, I designed the housing and motor mount for a tumbler assembly, ensuring the design met specific guidelines and measurements. After completing the design, I created a prototype using a stereolithography (SLA) 3D printer."
      ]
    },

    cloudair: {
      number:      "07",
      tags:        ["Product Design", "Consumer Electronics"],
      title:       "CloudAir One",
      description: "A combination air purifier and dehumidifier with a whimsical cloud form and transparent water container.",
      institution: "SF State University",
      year:        "2024",
      readMore: [
        "The CloudAir One is a combination air purifier and dehumidifier designed with a whimsical cloud form. Its transparent water container lets users watch the dehumidification process in action as droplets collect and fall.",
        "Air is drawn in through the top, purified through a HEPA filter, then dehumidified and released through the base of the cloud. The top cloud section fits easily into the base, making it simple to remove and empty the water."
      ]
    },

    createaplant: {
      number:      "08",
      tags:        ["Product Design", "Educational Toy", "Team Project"],
      title:       "Create-A-Plant",
      description: "An educational toy for children during COVID-19 - 3D-printed interlocking plant parts that teach botany through hands-on assembly.",
      institution: "Oregon State University",
      year:        "2020",
      readMore: [
        "I worked with three classmates to create Create-A-Plant, an educational toy designed for children during the COVID-19 quarantine. The goal was to make a toy that could be built at home for under $25 while being engaging and educational. Create-A-Plant consists of 3D-printed plant parts that children can assemble, with leaves and flowers that interlock with stems and a pot base. Each part is labeled with its name to help children learn about plants. The prototype was made with PLA and ABS plastic and cost $12.64 to produce.",
        "I contributed to all stages of development, including researching social, economic, and technical (SET) factors, identifying stakeholders, and defining customer requirements and engineering specifications. To understand needs, I interviewed two families and used their feedback to shape the product. My idea for Create-A-Plant was selected through team brainstorming and set-based design. I sketched initial concepts, modeled the pot and stems, and used 3D printing to produce the final prototype."
      ]
    }

  },

  // ── Call-to-Action Section ───────────────────────────────────────────────────
  cta: {
    label:         "Currently Available",
    heading:       "OPEN TO NEW<br>OPPORTUNITIES.",  // <br> creates the line break
    buttonContact: "Get In Touch",
    buttonAbout:   "About Me"
  },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    logo:      "Berkeley Skuratowicz",
    copyright: "© 2026 Berkeley Skuratowicz"
  },

  // ── About Page ───────────────────────────────────────────────────────────────
  about: {
    label:   "Biography",
    heading: "Engineering and Product Design",
    bio: [
      "I'm a Product Design graduate student at San Francisco State University with double degrees in Mechanical and Manufacturing Engineering from Oregon State University, where I graduated summa cum laude.",
      "My background includes engineering internships at Oregon Freeze Dry, Blue Marble, and Bioskin, where I modeled complex liquid piping systems, designed motor housings for consumer goods, and performed failure analysis on prototypes to ensure mechanical reliability.",
      "I am currently working on designing community centered spaces that encourage exploration and play for all ages at Playful SF and leading the implementation of a new makerspace at the Mountain View Public Library.",
      "I have experience with the whole product development cycle from research and brainstorming, to prototyping and manufacturing."
    ],
    contactHeading: "Contact & Resources",
    location:       "San Francisco, CA",
    degree:         "MS Product Design",

    expertise: {
      engineering: {
        number:      "01",
        title:       "Engineering Rigor",
        description: "Dual degrees in Mechanical and Manufacturing Engineering providing a foundation of technical feasibility, material science, and mechanical reliability.",
        skills:      ["Failure Analysis", "Piping Systems", "CAD Modeling"]
      },
      community: {
        number:      "02",
        title:       "Community Impact",
        description: "Focused on community-centered spaces that encourage exploration. Bridging the gap between institutional resources and public accessibility.",
        skills:      ["Makerspace Design", "Public Play Spaces", "Inclusive Design"]
      },
      product: {
        number:      "03",
        title:       "Product Lifecycle",
        description: "Expertise spanning the full development cycle. From the abstract sparks of brainstorming to the concrete realities of high-volume manufacturing.",
        skills:      ["Prototyping", "User Research", "Design for Mfg"]
      }
    },

    quote: {
      text:        "Good design is obvious. Great design is transparent.",
      attribution: "- Joe Sparano"
    }
  }

};
