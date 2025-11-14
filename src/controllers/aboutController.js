const About = require('../models/about');
const TeamMember = require('../models/teamMember');
exports.getAboutInfo = async (req, res) => {
  try {
    const about = await About.findOne();
    const team = await TeamMember.find();
    res.json({ about, team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};