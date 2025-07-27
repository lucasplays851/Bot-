// Carregar variáveis de ambiente
require('dotenv').config();

const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const express = require('express');

// Configuração do servidor web para manter o bot online
const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint de saúde para monitoramento
app.get('/', (req, res) => {
    res.json({ 
        status: 'Bot Discord Online!', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        guilds: client.guilds ? client.guilds.cache.size : 0
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: client.isReady() ? 'online' : 'offline',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        guilds: client.guilds ? client.guilds.cache.size : 0
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web rodando na porta ${PORT}`);
});

// Configuração do bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Armazenamento dos códigos (em produção, use um banco de dados)
const codes = new Map();
const usedCodes = new Map(); // Para rastrear quantas vezes cada código foi usado

// Função para validar código (apenas números e letras maiúsculas)
function isValidCode(code) {
    return /^[A-Z0-9]+$/.test(code);
}

// Função para criar embed do painel de resgate
function createRedeemPanel() {
    const embed = new EmbedBuilder()
        .setTitle('🎁 RESGATE SEU CÓDIGO')
        .setDescription('Digite seu código e clique em **RESGATAR** para receber sua recompensa!')
        .setColor(0x00FF00)
        .addFields(
            { name: '📋 Como usar:', value: 'Apenas números e letras MAIÚSCULAS são permitidos', inline: false }
        )
        .setFooter({ text: 'Sistema de Códigos • Bot VIP' });

    const button = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('redeem_code')
                .setLabel('RESGATAR')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎁')
        );

    return { embeds: [embed], components: [button] };
}

// Função para enviar lista de códigos no privado
async function sendCodesList(userId) {
    try {
        const user = await client.users.fetch(userId);
        const activeEmbed = new EmbedBuilder()
            .setTitle('📊 CÓDIGOS ATIVOS')
            .setColor(0x00FF00);

        const expiredEmbed = new EmbedBuilder()
            .setTitle('❌ CÓDIGOS EXPIRADOS')
            .setColor(0xFF0000);

        let activeCodes = '';
        let expiredCodes = '';

        for (const [code, data] of codes.entries()) {
            const used = usedCodes.get(code) || 0;
            const remaining = data.maxUses - used;

            if (remaining > 0) {
                activeCodes += `**${code}** - Cargo: ${data.role} - Restam: ${remaining} usos\n`;
            } else {
                expiredCodes += `**${code}** - Cargo: ${data.role} - EXPIRADO\n`;
            }
        }

        if (activeCodes) {
            activeEmbed.setDescription(activeCodes);
        } else {
            activeEmbed.setDescription('Nenhum código ativo no momento.');
        }

        if (expiredCodes) {
            expiredEmbed.setDescription(expiredCodes);
        } else {
            expiredEmbed.setDescription('Nenhum código expirado.');
        }

        await user.send({ embeds: [activeEmbed, expiredEmbed] });
    } catch (error) {
        console.error('Erro ao enviar lista de códigos:', error);
    }
}

// Evento quando o bot fica online
client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} está online!`);
    console.log(`🌐 Conectado em ${client.guilds.cache.size} servidores`);
    console.log(`🚀 Hospedado em: ${process.env.RENDER_SERVICE_NAME || process.env.RAILWAY_ENVIRONMENT || 'Local'}`);
    
    // Definir status do bot
    client.user.setActivity('Sistema de Códigos VIP', { type: 'WATCHING' });
    
    // Registrar comandos slash
    const commands = [
        new SlashCommandBuilder()
            .setName('criarcodigo')
            .setDescription('Criar um novo código de resgate')
            .addStringOption(option =>
                option.setName('codigo')
                    .setDescription('O código (apenas números e letras MAIÚSCULAS)')
                    .setRequired(true))
            .addRoleOption(option =>
                option.setName('cargo')
                    .setDescription('Cargo que será dado ao resgatar')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('quantidade')
                    .setDescription('Quantas vezes o código pode ser usado')
                    .setRequired(true)
                    .setMinValue(1))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

        new SlashCommandBuilder()
            .setName('setarvipcod')
            .setDescription('Enviar painel de resgate de códigos')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

        new SlashCommandBuilder()
            .setName('listarcodigos')
            .setDescription('Ver todos os códigos criados (enviado no privado)')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

        new SlashCommandBuilder()
            .setName('status')
            .setDescription('Ver status do bot')
    ];

    try {
        await client.application.commands.set(commands);
        console.log('✅ Comandos registrados com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
});

// Evento de interação (comandos e botões)
client.on('interactionCreate', async interaction => {
    try {
        // Comandos slash
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'criarcodigo') {
                const code = interaction.options.getString('codigo').toUpperCase();
                const role = interaction.options.getRole('cargo');
                const maxUses = interaction.options.getInteger('quantidade');

                // Validar código
                if (!isValidCode(code)) {
                    return interaction.reply({
                        content: '❌ Código inválido! Use apenas números e letras MAIÚSCULAS, sem acentos, símbolos ou pontos.',
                        ephemeral: true
                    });
                }

                // Verificar se código já existe
                if (codes.has(code)) {
                    return interaction.reply({
                        content: '❌ Este código já existe!',
                        ephemeral: true
                    });
                }

                // Criar código
                codes.set(code, {
                    role: role.name,
                    roleId: role.id,
                    maxUses: maxUses,
                    createdBy: interaction.user.id,
                    createdAt: new Date().toISOString()
                });
                usedCodes.set(code, 0);

                const embed = new EmbedBuilder()
                    .setTitle('✅ CÓDIGO CRIADO')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '📝 Código:', value: `\`${code}\``, inline: true },
                        { name: '👑 Cargo:', value: role.toString(), inline: true },
                        { name: '🔢 Usos:', value: `${maxUses}`, inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            else if (interaction.commandName === 'setarvipcod') {
                const panel = createRedeemPanel();
                await interaction.reply(panel);
            }

            else if (interaction.commandName === 'listarcodigos') {
                await sendCodesList(interaction.user.id);
                await interaction.reply({
                    content: '📋 Lista de códigos enviada no seu privado!',
                    ephemeral: true
                });
            }

            else if (interaction.commandName === 'status') {
                const embed = new EmbedBuilder()
                    .setTitle('📊 STATUS DO BOT')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '🤖 Bot:', value: client.user.tag, inline: true },
                        { name: '🌐 Servidores:', value: `${client.guilds.cache.size}`, inline: true },
                        { name: '⏱️ Uptime:', value: `${Math.floor(process.uptime() / 60)} minutos`, inline: true },
                        { name: '📝 Códigos Ativos:', value: `${codes.size}`, inline: true },
                        { name: '🔧 Versão:', value: 'v1.0.0', inline: true },
                        { name: '🚀 Status:', value: '🟢 Online', inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        // Botão de resgate
        else if (interaction.isButton() && interaction.customId === 'redeem_code') {
            const modal = new ModalBuilder()
                .setCustomId('code_modal')
                .setTitle('Digite seu código');

            const codeInput = new TextInputBuilder()
                .setCustomId('code_input')
                .setLabel('Código de Resgate')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Digite apenas números e letras MAIÚSCULAS')
                .setRequired(true)
                .setMaxLength(50);

            const actionRow = new ActionRowBuilder().addComponents(codeInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        }

        // Modal de código
        else if (interaction.isModalSubmit() && interaction.customId === 'code_modal') {
            const inputCode = interaction.fields.getTextInputValue('code_input').toUpperCase();

            // Validar formato do código
            if (!isValidCode(inputCode)) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ CÓDIGO INVÁLIDO')
                    .setDescription('Não pode utilizar acentos, símbolos, pontos ou letras minúsculas.\nApenas números e letras MAIÚSCULAS.')
                    .setColor(0xFF0000);

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Verificar se código existe
            if (!codes.has(inputCode)) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ CÓDIGO NÃO ENCONTRADO')
                    .setDescription('Esse código não existe!')
                    .setColor(0xFF0000);

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const codeData = codes.get(inputCode);
            const currentUses = usedCodes.get(inputCode) || 0;

            // Verificar se código ainda tem usos disponíveis
            if (currentUses >= codeData.maxUses) {
                const embed = new EmbedBuilder()
                    .setTitle('⏰ CÓDIGO EXPIRADO')
                    .setDescription('O código já foi utilizado por muitas pessoas, tarde demais! Tente na próxima.')
                    .setColor(0xFF0000);

                // Notificar criador sobre expiração
                if (currentUses === codeData.maxUses) {
                    try {
                        const creator = await client.users.fetch(codeData.createdBy);
                        const notifyEmbed = new EmbedBuilder()
                            .setTitle('⚠️ CÓDIGO EXPIRADO')
                            .setDescription(`O código **${inputCode}** atingiu o limite de usos e expirou.`)
                            .setColor(0xFF0000)
                            .setTimestamp();
                        
                        await creator.send({ embeds: [notifyEmbed] });
                    } catch (error) {
                        console.error('Erro ao notificar criador:', error);
                    }
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Verificar se usuário já tem o cargo
            const member = interaction.member;
            if (member.roles.cache.has(codeData.roleId)) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ VOCÊ JÁ TEM ESTE CARGO')
                    .setDescription('Você já possui este cargo!')
                    .setColor(0xFFFF00);

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            try {
                // Dar o cargo ao usuário
                await member.roles.add(codeData.roleId);
                
                // Incrementar contador de usos
                usedCodes.set(inputCode, currentUses + 1);

                const embed = new EmbedBuilder()
                    .setTitle('🎉 RESGATADO COM SUCESSO')
                    .setDescription('Aproveite seu resgate!')
                    .addFields(
                        { name: '👑 Cargo Recebido:', value: `<@&${codeData.roleId}>`, inline: false },
                        { name: '📊 Usos Restantes:', value: `${codeData.maxUses - (currentUses + 1)}`, inline: true }
                    )
                    .setColor(0x00FF00)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });

                // Log do resgate
                console.log(`✅ Código ${inputCode} resgatado por ${interaction.user.tag}`);

            } catch (error) {
                console.error('Erro ao dar cargo:', error);
                const embed = new EmbedBuilder()
                    .setTitle('❌ ERRO')
                    .setDescription('Erro ao aplicar o cargo. Contate um administrador.')
                    .setColor(0xFF0000);

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

    } catch (error) {
        console.error('❌ Erro na interação:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Ocorreu um erro. Tente novamente.',
                ephemeral: true
            });
        }
    }
});

// Tratamento de erros
process.on('unhandledRejection', error => {
    console.error('❌ Erro não tratado:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Exceção não capturada:', error);
    process.exit(1);
});

// Evento de desconexão
client.on('disconnect', () => {
    console.log('⚠️ Bot desconectado!');
});

// Evento de reconexão
client.on('reconnecting', () => {
    console.log('🔄 Reconectando...');
});

// Login do bot usando variável de ambiente
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Erro ao fazer login:', error);
    process.exit(1);
});

// Exportar para uso em outros arquivos se necessário
module.exports = { client, codes, usedCodes };
